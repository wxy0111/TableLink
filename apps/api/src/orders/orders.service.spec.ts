import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StateMachineService } from '../workflow/state-machine.service';
import { OrdersService } from './orders.service';

function createService() {
  const prisma = {
    diningTable: {
      findUnique: vi.fn(),
    },
    menuItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
    orderItem: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(tx)),
  };

  const tx = {
    order: {
      create: vi.fn(),
      update: vi.fn(),
    },
    orderItem: {
      create: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      update: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    diningTable: {
      update: vi.fn(),
    },
    ledgerEntry: {
      upsert: vi.fn(),
    },
  };

  const ledger = {
    createItemSale: vi.fn(),
    createItemVoid: vi.fn(),
    createPaymentReceived: vi.fn(),
    createPaymentRefund: vi.fn(),
    createDiscount: vi.fn((transaction, input) =>
      transaction.ledgerEntry.upsert({
        create: { ...input, entryType: 'discount' },
        update: input,
      }),
    ),
    createAdjustment: vi.fn((transaction, input) =>
      transaction.ledgerEntry.upsert({
        create: { ...input, entryType: 'adjustment' },
        update: input,
      }),
    ),
  };
  const realtime = {
    publish: vi.fn(),
  };

  return {
    prisma,
    tx,
    ledger,
    realtime,
    service: new OrdersService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
      new StateMachineService(),
      realtime as unknown as RealtimeService,
    ),
  };
}

describe('OrdersService', () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it('calculates customer order totals from server menu prices and stores item snapshots', async () => {
    const { prisma, tx, ledger, realtime, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      restaurantId: 'restaurant-1',
      name: 'A01',
      code: 'TABLE-01',
      status: 'idle',
      restaurant: { id: 'restaurant-1' },
    });
    prisma.menuItem.findMany.mockResolvedValue([
      {
        id: 'menu-1',
        restaurantId: 'restaurant-1',
        name: 'Noodles',
        price: 1200,
        kitchenStation: 'staple',
        options: [{ name: 'Size', values: [{ name: 'Large', priceDelta: 300 }] }],
      },
    ]);
    tx.order.create.mockImplementation(({ data }) => {
      const createdItems = data.items.create.map((item: { menuItemId: string; nameSnapshot: string; priceSnapshot: number; quantity: number }, index: number) => ({
        id: `item-${index + 1}`,
        ...item,
      }));
      return Promise.resolve({ id: 'order-1', orderNo: data.orderNo, totalAmount: data.totalAmount, items: createdItems, table: { id: 'table-1' } });
    });

    const order = await service.createCustomerOrder({
      tableCode: 'TABLE-01',
      items: [{ menuItemId: 'menu-1', quantity: 2, options: [{ optionName: 'Size', valueName: 'Large' }] }],
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotalAmount: 3000,
          totalAmount: 3000,
          items: {
            create: [
              expect.objectContaining({
                menuItemId: 'menu-1',
                nameSnapshot: 'Noodles',
                priceSnapshot: 1500,
                quantity: 2,
              }),
            ],
          },
        }),
      }),
    );
    expect(order.totalAmount).toBe(3000);
    expect(ledger.createItemSale).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: 3000, orderItemId: 'item-1' }));
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'kitchen.updated' });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'staff.tables.updated' });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'admin.reports.updated' });
  });

  it('rejects customer orders when a required single option is missing', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      restaurantId: 'restaurant-1',
      status: 'idle',
      restaurant: { id: 'restaurant-1' },
    });
    prisma.menuItem.findMany.mockResolvedValue([
      {
        id: 'menu-1',
        restaurantId: 'restaurant-1',
        name: 'Noodles',
        price: 1200,
        kitchenStation: 'staple',
        options: [{ name: 'Size', type: 'single', required: true, values: [{ name: 'Large', priceDelta: 300 }] }],
      },
    ]);

    await expect(
      service.createCustomerOrder({
        tableCode: 'TABLE-01',
        items: [{ menuItemId: 'menu-1', quantity: 1, options: [] }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects customer orders when single options select multiple values', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      restaurantId: 'restaurant-1',
      status: 'idle',
      restaurant: { id: 'restaurant-1' },
    });
    prisma.menuItem.findMany.mockResolvedValue([
      {
        id: 'menu-1',
        restaurantId: 'restaurant-1',
        name: 'Noodles',
        price: 1200,
        kitchenStation: 'staple',
        options: [
          {
            name: 'Size',
            type: 'single',
            required: false,
            values: [
              { name: 'Small', priceDelta: 0 },
              { name: 'Large', priceDelta: 300 },
            ],
          },
        ],
      },
    ]);

    await expect(
      service.createCustomerOrder({
        tableCode: 'TABLE-01',
        items: [
          {
            menuItemId: 'menu-1',
            quantity: 1,
            options: [
              { optionName: 'Size', valueName: 'Small' },
              { optionName: 'Size', valueName: 'Large' },
            ],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows multiple option values and stores option price snapshots', async () => {
    const { prisma, tx, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      restaurantId: 'restaurant-1',
      name: 'A01',
      code: 'TABLE-01',
      status: 'idle',
      restaurant: { id: 'restaurant-1' },
    });
    prisma.menuItem.findMany.mockResolvedValue([
      {
        id: 'menu-1',
        restaurantId: 'restaurant-1',
        name: 'Noodles',
        price: 1200,
        kitchenStation: 'staple',
        options: [
          {
            name: 'Toppings',
            type: 'multiple',
            required: false,
            values: [
              { name: 'Egg', priceDelta: 200 },
              { name: 'Meat', priceDelta: 500 },
            ],
          },
        ],
      },
    ]);
    tx.order.create.mockImplementation(({ data }) => {
      const createdItems = data.items.create.map((item: { menuItemId: string; nameSnapshot: string; priceSnapshot: number; quantity: number }, index: number) => ({
        id: `item-${index + 1}`,
        ...item,
      }));
      return Promise.resolve({ id: 'order-1', orderNo: data.orderNo, totalAmount: data.totalAmount, items: createdItems, table: { id: 'table-1' } });
    });

    await service.createCustomerOrder({
      tableCode: 'TABLE-01',
      items: [
        {
          menuItemId: 'menu-1',
          quantity: 1,
          options: [
            { optionName: 'Toppings', valueName: 'Egg' },
            { optionName: 'Toppings', valueName: 'Meat' },
          ],
        },
      ],
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 1900,
          items: {
            create: [
              expect.objectContaining({
                priceSnapshot: 1900,
                optionsSnapshot: [
                  { optionName: 'Toppings', valueName: 'Egg', priceDelta: 200 },
                  { optionName: 'Toppings', valueName: 'Meat', priceDelta: 500 },
                ],
              }),
            ],
          },
        }),
      }),
    );
  });

  it('rejects customer orders for non-existent option values', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      restaurantId: 'restaurant-1',
      status: 'idle',
      restaurant: { id: 'restaurant-1' },
    });
    prisma.menuItem.findMany.mockResolvedValue([
      {
        id: 'menu-1',
        restaurantId: 'restaurant-1',
        name: 'Noodles',
        price: 1200,
        kitchenStation: 'staple',
        options: [{ name: 'Size', type: 'single', required: false, values: [{ name: 'Large', priceDelta: 300 }] }],
      },
    ]);

    await expect(
      service.createCustomerOrder({
        tableCode: 'TABLE-01',
        items: [{ menuItemId: 'menu-1', quantity: 1, options: [{ optionName: 'Size', valueName: 'Huge' }] }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unavailable menu items when creating a customer order', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      restaurantId: 'restaurant-1',
      status: 'idle',
      restaurant: { id: 'restaurant-1' },
    });
    prisma.menuItem.findMany.mockResolvedValue([]);

    await expect(
      service.createCustomerOrder({
        tableCode: 'TABLE-01',
        items: [{ menuItemId: 'missing-menu', quantity: 1, options: [] }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects sold out menu items when creating a customer order', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({
      id: 'table-1',
      restaurantId: 'restaurant-1',
      status: 'idle',
      restaurant: { id: 'restaurant-1' },
    });
    prisma.menuItem.findMany.mockResolvedValue([]);

    await expect(
      service.createCustomerOrder({
        tableCode: 'TABLE-01',
        items: [{ menuItemId: 'sold-out-menu', quantity: 1, options: [] }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('rejects customer orders for an invalidated old table code', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue(null);

    await expect(
      service.createCustomerOrder({
        tableCode: 'TABLE-OLD',
        items: [{ menuItemId: 'menu-1', quantity: 1, options: [] }],
      }),
    ).rejects.toThrow('Table not found');
  });

  it('requires a matching customer access token for public order lookup', async () => {
    const { prisma, service } = context;
    const customerAccessToken = 'plain-token';
    const customerAccessTokenHash = service.hashCustomerAccessToken(customerAccessToken);
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORDER-1',
      customerAccessTokenHash,
      table: { id: 'table-1' },
      items: [],
      payments: [],
      events: [],
    });

    await expect(service.findPublicOne('order-1')).rejects.toThrow(BadRequestException);
    await expect(service.findPublicOne('order-1', 'wrong-token')).rejects.toThrow(BadRequestException);
    await expect(service.findPublicOne('order-1', customerAccessToken)).resolves.toEqual(expect.objectContaining({ id: 'order-1' }));
  });

  it('marks partial payment, rejects overpayment, and records payment ledger entries', async () => {
    const { prisma, tx, ledger, realtime, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      totalAmount: 3000,
      payments: [],
      table: { id: 'table-1', status: 'dining' },
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-1' });
    tx.order.update.mockResolvedValue({ id: 'order-1', paymentStatus: 'partially_paid' });

    await expect(service.createPayment('order-1', { method: 'cash', amount: 4000 })).rejects.toThrow(BadRequestException);

    const updatedOrder = await service.createPayment('order-1', { method: 'cash', amount: 1000 });

    expect(updatedOrder.paymentStatus).toBe('partially_paid');
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'manual', status: 'paid' }),
      }),
    );
    expect(ledger.createPaymentReceived).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: 1000, paymentId: 'payment-1' }));
    expect(tx.diningTable.update).not.toHaveBeenCalled();
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'staff.tables.updated' });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'admin.reports.updated' });
  });

  it('marks full payment as paid and moves the table to paying', async () => {
    const { prisma, tx, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      status: 'accepted',
      paymentStatus: 'partially_paid',
      totalAmount: 3000,
      payments: [{ amount: 1000, status: 'paid' }],
      table: { id: 'table-1', status: 'dining' },
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-2' });
    tx.order.update.mockResolvedValue({ id: 'order-1', paymentStatus: 'paid' });

    const updatedOrder = await service.createPayment('order-1', { method: 'wechat', amount: 2000 });

    expect(updatedOrder.paymentStatus).toBe('paid');
    expect(tx.diningTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'paying' } });
  });

  it('rejects payments for cancelled orders', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'cancelled',
      totalAmount: 3000,
      payments: [],
      table: { status: 'dining' },
    });

    await expect(service.createPayment('order-1', { method: 'cash', amount: 1000 })).rejects.toThrow(BadRequestException);
  });

  it('creates an online payment intent as pending without changing order status or ledger', async () => {
    const { prisma, tx, ledger, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      totalAmount: 3000,
      payments: [],
      table: { id: 'table-1', status: 'dining' },
    });
    tx.payment.create.mockResolvedValue({
      id: 'payment-intent-1',
      orderId: 'order-1',
      method: 'wechat',
      amount: 2000,
      channel: 'online',
      status: 'pending',
      merchantTradeNo: 'PAY-ORDER-1',
    });

    const intent = await service.createPaymentIntent('order-1', { method: 'wechat', amount: 2000 });

    expect(intent).toEqual(expect.objectContaining({ paymentId: 'payment-intent-1', status: 'pending', method: 'wechat', amount: 2000 }));
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'online',
          status: 'pending',
          method: 'wechat',
          amount: 2000,
          merchantTradeNo: expect.stringMatching(/^MOCK-/),
        }),
      }),
    );
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(ledger.createPaymentReceived).not.toHaveBeenCalled();
  });

  it('rejects over-amount online payment intent creation', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      totalAmount: 3000,
      payments: [{ amount: 1000, status: 'paid' }],
      table: { id: 'table-1', status: 'dining' },
    });

    await expect(service.createPaymentIntent('order-1', { method: 'wechat', amount: 2500 })).rejects.toThrow(BadRequestException);
  });

  it('marks a pending online payment paid, writes ledger, and updates order payment status', async () => {
    const { prisma, tx, ledger, service } = context;
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-intent-1',
      orderId: 'order-1',
      method: 'wechat',
      amount: 2000,
      channel: 'online',
      status: 'pending',
      order: {
        id: 'order-1',
        restaurantId: 'restaurant-1',
        tableId: 'table-1',
        orderNo: 'ORDER-1',
        status: 'accepted',
        paymentStatus: 'unpaid',
        totalAmount: 3000,
        payments: [],
        table: { id: 'table-1', status: 'dining' },
      },
    });
    tx.payment.update.mockResolvedValue({ id: 'payment-intent-1', status: 'paid' });
    tx.order.update.mockResolvedValue({ id: 'order-1', paymentStatus: 'partially_paid' });

    const order = await service.markPaymentIntentPaid('payment-intent-1', { providerTradeNo: 'WX-1' });

    expect(order.paymentStatus).toBe('partially_paid');
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-intent-1' },
      data: { status: 'paid', paidAt: expect.any(Date), providerTradeNo: 'WX-1', rawPayload: expect.any(Object) },
    });
    expect(ledger.createPaymentReceived).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: 2000, paymentId: 'payment-intent-1' }));
  });

  it('marks a full online payment paid and moves the table to paying', async () => {
    const { prisma, tx, service } = context;
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-intent-1',
      orderId: 'order-1',
      method: 'wechat',
      amount: 3000,
      channel: 'online',
      status: 'pending',
      order: {
        id: 'order-1',
        restaurantId: 'restaurant-1',
        tableId: 'table-1',
        orderNo: 'ORDER-1',
        status: 'accepted',
        paymentStatus: 'unpaid',
        totalAmount: 3000,
        payments: [],
        table: { id: 'table-1', status: 'dining' },
      },
    });
    tx.payment.update.mockResolvedValue({ id: 'payment-intent-1', status: 'paid' });
    tx.order.update.mockResolvedValue({ id: 'order-1', paymentStatus: 'paid' });

    await service.markPaymentIntentPaid('payment-intent-1', {});

    expect(tx.diningTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'paying' } });
  });

  it('does not double-book repeated mark-paid calls', async () => {
    const { prisma, tx, ledger, service } = context;
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-intent-1',
      status: 'paid',
      amount: 3000,
      channel: 'online',
      order: { id: 'order-1', payments: [], table: { id: 'table-1' } },
    });

    const payment = await service.markPaymentIntentPaid('payment-intent-1', {});

    expect(payment).toEqual(expect.objectContaining({ id: 'payment-intent-1', status: 'paid' }));
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(ledger.createPaymentReceived).not.toHaveBeenCalled();
  });

  it('closes a pending payment intent and rejects closing paid intents', async () => {
    const { prisma, tx, service } = context;
    prisma.payment.findUnique.mockResolvedValueOnce({ id: 'payment-intent-1', status: 'pending', channel: 'online' });
    tx.payment.update.mockResolvedValue({ id: 'payment-intent-1', status: 'closed' });

    await expect(service.closePaymentIntent('payment-intent-1')).resolves.toEqual(expect.objectContaining({ status: 'closed' }));
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: 'payment-intent-1' }, data: { status: 'closed' } });

    prisma.payment.findUnique.mockResolvedValueOnce({ id: 'payment-intent-2', status: 'paid', channel: 'online' });
    await expect(service.closePaymentIntent('payment-intent-2')).rejects.toThrow(BadRequestException);
  });

  it('rejects mark-paid after an intent is closed', async () => {
    const { prisma, service } = context;
    prisma.payment.findUnique.mockResolvedValue({ id: 'payment-intent-1', status: 'closed', channel: 'online' });

    await expect(service.markPaymentIntentPaid('payment-intent-1', {})).rejects.toThrow(BadRequestException);
  });

  it('guards mock webhook with a local secret and is idempotent through mark-paid', async () => {
    const { service } = context;
    const previousSecret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
    process.env.MOCK_PAYMENT_WEBHOOK_SECRET = 'local-secret';

    await expect(service.handleMockPaymentWebhook({ secret: 'wrong', paymentId: 'payment-intent-1' })).rejects.toThrow(BadRequestException);

    const markSpy = vi.spyOn(service, 'markPaymentIntentPaid').mockResolvedValue({ id: 'payment-intent-1', status: 'paid' } as never);
    await expect(service.handleMockPaymentWebhook({ secret: 'local-secret', paymentId: 'payment-intent-1', providerTradeNo: 'MOCK-1' })).resolves.toEqual(
      expect.objectContaining({ status: 'paid' }),
    );
    expect(markSpy).toHaveBeenCalledWith('payment-intent-1', expect.objectContaining({ providerTradeNo: 'MOCK-1' }));

    if (previousSecret === undefined) {
      delete process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
    } else {
      process.env.MOCK_PAYMENT_WEBHOOK_SECRET = previousSecret;
    }
  });

  it('adds a discount adjustment to an unpaid order and writes event, audit log, and ledger entry', async () => {
    const { prisma, tx, realtime, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      totalAmount: 3000,
      discountAmount: 0,
      payments: [],
      table: { id: 'table-1', name: 'A01' },
    });
    tx.orderEvent.create.mockResolvedValue({ id: 'event-1' });
    tx.order.update.mockResolvedValue({ id: 'order-1', totalAmount: 2500, discountAmount: 500 });

    const updatedOrder = await service.createAdjustment('order-1', { type: 'discount', amount: 500, reason: 'manager discount' });

    expect(updatedOrder).toEqual(expect.objectContaining({ totalAmount: 2500, discountAmount: 500 }));
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { discountAmount: { increment: 500 }, totalAmount: { increment: -500 } },
      include: { items: true, payments: true, table: true },
    });
    expect(tx.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'order.adjustment.discount', amountDelta: -500, reason: 'manager discount' }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'order.adjustment.discount' }) }));
    expect(tx.ledgerEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ entryType: 'discount', amount: 500, sourceId: 'event-1' }),
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'staff.tables.updated' });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'admin.reports.updated' });
  });

  it('rejects a discount that would reduce total below already paid net amount', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'accepted',
      paymentStatus: 'partially_paid',
      totalAmount: 3000,
      payments: [{ amount: 2800, status: 'paid' }],
      table: { id: 'table-1', name: 'A01' },
    });

    await expect(service.createAdjustment('order-1', { type: 'rounding', amount: 300, reason: 'round down' })).rejects.toThrow(BadRequestException);
  });

  it('rejects adjustments for paid and cancelled orders', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'accepted',
      paymentStatus: 'paid',
      totalAmount: 3000,
      payments: [{ amount: 3000, status: 'paid' }],
      table: { id: 'table-1', name: 'A01' },
    });

    await expect(service.createAdjustment('order-1', { type: 'service_charge', amount: 300, reason: 'room service' })).rejects.toThrow(BadRequestException);

    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'cancelled',
      paymentStatus: 'unpaid',
      totalAmount: 3000,
      payments: [],
      table: { id: 'table-1', name: 'A01' },
    });

    await expect(service.createAdjustment('order-1', { type: 'discount', amount: 300, reason: 'cancelled' })).rejects.toThrow(BadRequestException);
  });

  it('adds a service charge as an adjustment ledger entry and increases order total', async () => {
    const { prisma, tx, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      totalAmount: 3000,
      discountAmount: 0,
      payments: [],
      table: { id: 'table-1', name: 'A01' },
    });
    tx.orderEvent.create.mockResolvedValue({ id: 'event-2' });
    tx.order.update.mockResolvedValue({ id: 'order-1', totalAmount: 3300, discountAmount: 0 });

    await service.createAdjustment('order-1', { type: 'service_charge', amount: 300, reason: 'room service' });

    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: { totalAmount: { increment: 300 } } }));
    expect(tx.ledgerEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ entryType: 'adjustment', amount: 300, sourceId: 'event-2' }),
      }),
    );
  });

  it('reopens a paid order without deleting original payments and writes event and audit log', async () => {
    const { prisma, tx, realtime, service } = context;
    const payment = { id: 'payment-1', amount: 3000, status: 'paid' };
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      status: 'served',
      paymentStatus: 'paid',
      paidAt: new Date('2026-06-18T12:00:00Z'),
      totalAmount: 3000,
      payments: [payment],
      table: { id: 'table-1', name: 'A01', status: 'paying' },
    });
    tx.order.update.mockResolvedValue({ id: 'order-1', paymentStatus: 'partially_paid', paidAt: null, payments: [payment] });

    const order = await service.reopenOrder('order-1', { reason: 'manager correction' });

    expect(order).toEqual(expect.objectContaining({ paymentStatus: 'partially_paid', payments: [payment] }));
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'partially_paid', paidAt: null },
      include: { items: true, payments: true, table: true },
    });
    expect(tx.diningTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'paying' } });
    expect(tx.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'payment.reopened',
          metadata: expect.objectContaining({
            previousPaymentStatus: 'paid',
            netPaidAmount: 3000,
            totalAmount: 3000,
            reason: 'manager correction',
          }),
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'order.reopened' }) }));
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'staff.tables.updated' });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'admin.reports.updated' });
  });

  it('rejects reopening unpaid, partially paid, and cancelled orders', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      payments: [],
      table: { status: 'dining' },
    });

    await expect(service.reopenOrder('order-1', { reason: 'not paid' })).rejects.toThrow(BadRequestException);

    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'accepted',
      paymentStatus: 'partially_paid',
      payments: [{ amount: 1000, status: 'paid' }],
      table: { status: 'dining' },
    });

    await expect(service.reopenOrder('order-1', { reason: 'partial' })).rejects.toThrow(BadRequestException);

    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      status: 'cancelled',
      paymentStatus: 'paid',
      payments: [{ amount: 3000, status: 'paid' }],
      table: { status: 'paying' },
    });

    await expect(service.reopenOrder('order-1', { reason: 'cancelled' })).rejects.toThrow(BadRequestException);
  });

  it('allows service charge adjustment after reopening a paid order', async () => {
    const { prisma, tx, service } = context;
    prisma.order.findUnique
      .mockResolvedValueOnce({
        id: 'order-1',
        restaurantId: 'restaurant-1',
        tableId: 'table-1',
        orderNo: 'ORDER-1',
        status: 'served',
        paymentStatus: 'paid',
        totalAmount: 3000,
        payments: [{ amount: 3000, status: 'paid' }],
        table: { id: 'table-1', name: 'A01', status: 'paying' },
      })
      .mockResolvedValueOnce({
        id: 'order-1',
        restaurantId: 'restaurant-1',
        tableId: 'table-1',
        orderNo: 'ORDER-1',
        status: 'served',
        paymentStatus: 'partially_paid',
        totalAmount: 3000,
        discountAmount: 0,
        payments: [{ amount: 3000, status: 'paid' }],
        table: { id: 'table-1', name: 'A01', status: 'paying' },
      });
    tx.order.update.mockResolvedValueOnce({ id: 'order-1', paymentStatus: 'partially_paid' }).mockResolvedValueOnce({ id: 'order-1', totalAmount: 3300 });
    tx.orderEvent.create.mockResolvedValue({ id: 'event-1' });

    await service.reopenOrder('order-1', { reason: 'adjust after paid' });
    await service.createAdjustment('order-1', { type: 'service_charge', amount: 300, reason: 'room service' });

    expect(tx.order.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { totalAmount: { increment: 300 } } }));
  });

  it('refunds an order item once, reduces order total, and writes item_void ledger', async () => {
    const { prisma, tx, ledger, service } = context;
    prisma.orderItem.findFirst.mockResolvedValue({
      id: 'item-1',
      orderId: 'order-1',
      status: 'served',
      priceSnapshot: 800,
      quantity: 2,
      nameSnapshot: 'Tea',
      order: {
        id: 'order-1',
        restaurantId: 'restaurant-1',
        tableId: 'table-1',
        orderNo: 'ORDER-1',
        table: { id: 'table-1', name: 'A01' },
      },
    });
    tx.orderItem.update.mockResolvedValue({ id: 'item-1', status: 'refunded' });

    const refundedItem = await service.refundItem('order-1', 'item-1', { reason: 'wrong item' });

    expect(refundedItem.status).toBe('refunded');
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalAmount: { increment: -1600 } }) }));
    expect(ledger.createItemVoid).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: 1600, orderItemId: 'item-1' }));

    prisma.orderItem.findFirst.mockResolvedValue({ status: 'refunded' });
    await expect(service.refundItem('order-1', 'item-1', {})).rejects.toThrow(BadRequestException);
  });

  it('rejects sold out menu items when staff add items', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      table: { id: 'table-1', status: 'dining' },
    });
    prisma.menuItem.findFirst.mockResolvedValue(null);

    await expect(service.addItem('order-1', { menuItemId: 'sold-out-menu', quantity: 1, options: [] })).rejects.toThrow(BadRequestException);
    expect(prisma.menuItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('adds staff order items with required options and option price snapshots', async () => {
    const { prisma, tx, ledger, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      subtotalAmount: 0,
      totalAmount: 0,
      table: { id: 'table-1', name: 'A01', status: 'dining' },
    });
    prisma.menuItem.findFirst.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      name: 'Noodles',
      price: 1200,
      kitchenStation: 'staple',
      options: [{ name: 'Size', type: 'single', required: true, values: [{ name: 'Large', priceDelta: 300 }] }],
    });
    tx.orderItem.create.mockResolvedValue({ id: 'item-1', priceSnapshot: 1500, quantity: 1 });
    tx.order.update.mockResolvedValue({ id: 'order-1', totalAmount: 1500 });

    await service.addItem('order-1', { menuItemId: 'menu-1', quantity: 1, options: [{ optionName: 'Size', valueName: 'Large' }] });

    expect(tx.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priceSnapshot: 1500,
          optionsSnapshot: [{ optionName: 'Size', valueName: 'Large', priceDelta: 300 }],
        }),
      }),
    );
    expect(ledger.createItemSale).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: 1500, orderItemId: 'item-1' }));
  });

  it('rejects staff add items when required options are missing', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      status: 'accepted',
      paymentStatus: 'unpaid',
      table: { id: 'table-1', status: 'dining' },
    });
    prisma.menuItem.findFirst.mockResolvedValue({
      id: 'menu-1',
      restaurantId: 'restaurant-1',
      name: 'Noodles',
      price: 1200,
      kitchenStation: 'staple',
      options: [{ name: 'Size', type: 'single', required: true, values: [{ name: 'Large', priceDelta: 300 }] }],
    });

    await expect(service.addItem('order-1', { menuItemId: 'menu-1', quantity: 1, options: [] })).rejects.toThrow(BadRequestException);
  });

  it('returns historical order item snapshots without re-reading menu item status', async () => {
    const { prisma, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      orderNo: 'ORDER-1',
      table: { id: 'table-1' },
      items: [{ id: 'item-1', nameSnapshot: 'Old Noodles', priceSnapshot: 1200, quantity: 1 }],
      payments: [],
      events: [],
    });

    const order = await service.findOne('order-1');

    expect(order.items[0]).toEqual(expect.objectContaining({ nameSnapshot: 'Old Noodles', priceSnapshot: 1200 }));
    expect(prisma.menuItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
  });

  it('refunds payments within paid net amount and writes payment_refund ledger', async () => {
    const { prisma, tx, ledger, service } = context;
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      tableId: 'table-1',
      orderNo: 'ORDER-1',
      paymentStatus: 'paid',
      totalAmount: 3000,
      paidAt: new Date('2026-06-18T12:00:00Z'),
      payments: [
        { amount: 3000, status: 'paid' },
        { amount: 500, status: 'refunded' },
      ],
      table: { id: 'table-1', name: 'A01' },
    });
    tx.payment.create.mockResolvedValue({ id: 'refund-1' });
    tx.order.update.mockResolvedValue({ id: 'order-1', paymentStatus: 'partially_paid' });

    await expect(service.refundPayment('order-1', { method: 'cash', amount: 2600 })).rejects.toThrow(BadRequestException);

    const updatedOrder = await service.refundPayment('order-1', { method: 'cash', amount: 500 });

    expect(updatedOrder.paymentStatus).toBe('partially_paid');
    expect(ledger.createPaymentRefund).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: 500, paymentId: 'refund-1' }));
  });
});
