import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { normalizeMenuOptionValues } from '../menu/menu-option-values';
import { PRINT_JOB_TYPES } from '../print/print-job-types';
import { RealtimeService } from '../realtime/realtime.service';
import { StateMachineService } from '../workflow/state-machine.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AddOrderItemDto, HoldOrderItemDto, ReasonDto, RefundPaymentDto } from './dto/frontdesk-order.dto';
import { CreateOrderAdjustmentDto, OrderAdjustmentType } from './dto/order-adjustment.dto';
import { CreatePaymentIntentDto, MarkPaymentIntentPaidDto, MockPaymentWebhookDto } from './dto/payment-intent.dto';
import { ReopenOrderDto } from './dto/reopen-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly stateMachine: StateMachineService,
    private readonly realtime: RealtimeService,
  ) {}

  async createCustomerOrder(dto: CreateOrderDto) {
    const table = await this.prisma.diningTable.findUnique({
      where: { code: dto.tableCode },
      include: { restaurant: true },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: dto.items.map((item) => item.menuItemId) },
        restaurantId: table.restaurantId,
        status: 'active',
      },
      include: { options: true },
    });
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));

    const orderItems = dto.items.map((item) => {
      const menuItem = menuItemsById.get(item.menuItemId);
      if (!menuItem) {
        throw new BadRequestException(`Menu item is unavailable: ${item.menuItemId}`);
      }

      const selectedOptions = this.resolveOptions(menuItem.options, item.options);
      const unitPrice = menuItem.price + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);

      return {
        menuItemId: menuItem.id,
        nameSnapshot: menuItem.name,
        priceSnapshot: unitPrice,
        quantity: item.quantity,
        optionsSnapshot: selectedOptions.length ? selectedOptions : Prisma.JsonNull,
        kitchenStation: menuItem.kitchenStation,
        remark: item.remark,
      };
    });

    const totalAmount = orderItems.reduce((sum, item) => sum + item.priceSnapshot * item.quantity, 0);
    const orderNo = this.createOrderNo();
    const customerAccessToken = this.createCustomerAccessToken();
    const customerAccessTokenHash = this.hashCustomerAccessToken(customerAccessToken);
    this.stateMachine.assertTableTransition(table.status, 'dining');

    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          restaurantId: table.restaurantId,
          tableId: table.id,
          orderNo,
          remark: dto.remark,
          subtotalAmount: totalAmount,
          totalAmount,
          customerAccessTokenHash,
          items: { create: orderItems },
          events: {
            create: {
              eventType: 'order.created',
              toStatus: 'submitted',
              operatorType: 'customer',
              amountDelta: totalAmount,
            },
          },
          printJobs: {
            create: {
              restaurantId: table.restaurantId,
              tableId: table.id,
              jobType: PRINT_JOB_TYPES.kitchenOrder,
              title: `Kitchen order ${orderNo}`,
              payload: {
                orderNo,
                tableName: table.name,
                items: orderItems.map((item) => ({
                  name: item.nameSnapshot,
                  quantity: item.quantity,
                  remark: item.remark ?? null,
                  kitchenStation: item.kitchenStation,
                })),
                remark: dto.remark ?? null,
              },
            },
          },
        },
        include: { items: true, table: true },
      });

      await tx.diningTable.update({
        where: { id: table.id },
        data: { status: 'dining' },
      });

      for (const item of order.items) {
        await this.ledger.createItemSale(tx, {
          restaurantId: table.restaurantId,
          tableId: table.id,
          orderId: order.id,
          orderItemId: item.id,
          amount: item.priceSnapshot * item.quantity,
          sourceId: item.id,
          note: `点菜 ${item.nameSnapshot} x ${item.quantity}`,
          metadata: {
            orderNo: order.orderNo,
            tableName: table.name,
            createdByType: 'customer',
          },
        });
      }

      return order;
    });

    this.publishMany(['kitchen.updated', 'staff.tables.updated', 'admin.reports.updated', 'print.updated']);
    return { ...order, customerAccessToken };
  }

  async findOne(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: true,
        items: true,
        payments: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async findPublicOne(orderId: string, customerAccessToken?: string) {
    const order = await this.findOne(orderId);

    if (!order.customerAccessTokenHash) {
      if (process.env.NODE_ENV !== 'production') {
        return order;
      }
      throw new BadRequestException('Order access token is required');
    }

    if (!customerAccessToken || !this.safeEqualCustomerAccessToken(customerAccessToken, order.customerAccessTokenHash)) {
      throw new BadRequestException('Invalid order access token');
    }

    const { customerAccessTokenHash: _customerAccessTokenHash, ...publicOrder } = order;
    return publicOrder;
  }

  hashCustomerAccessToken(token: string) {
    return createHash('sha256').update(token).digest('base64url');
  }

  async createPayment(orderId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, table: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot pay a cancelled order');
    }

    const netPaidAmount = this.calculateNetPaidAmount(order.payments);
    const remainingAmount = order.totalAmount - netPaidAmount;

    if (remainingAmount <= 0) {
      throw new BadRequestException('Order is already paid');
    }

    if (dto.amount > remainingAmount) {
      throw new BadRequestException(`Payment amount exceeds remaining amount: ${remainingAmount}`);
    }

    const nextPaidAmount = netPaidAmount + dto.amount;
    const nextPaymentStatus = nextPaidAmount >= order.totalAmount ? 'paid' : 'partially_paid';
    this.stateMachine.assertPaymentTransition(order.paymentStatus, nextPaymentStatus);
    if (nextPaymentStatus === 'paid') {
      this.stateMachine.assertTableTransition(order.table.status, 'paying');
    }
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId,
          method: dto.method,
          amount: dto.amount,
          channel: 'manual',
          status: 'paid',
          paidAt: now,
        },
      });

      await this.ledger.createPaymentReceived(tx, {
        restaurantId: order.restaurantId,
        tableId: order.tableId,
        orderId,
        paymentId: payment.id,
        amount: dto.amount,
        sourceId: payment.id,
        note: `收款 ${dto.method}`,
        occurredAt: now,
        metadata: {
          orderNo: order.orderNo,
          method: dto.method,
          note: dto.note ?? null,
        },
      });

      if (nextPaymentStatus === 'paid') {
        await tx.diningTable.update({
          where: { id: order.tableId },
          data: { status: 'paying' },
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: nextPaymentStatus,
          paidAt: nextPaymentStatus === 'paid' ? now : null,
          events: {
            create: {
              eventType: 'payment.created',
              operatorType: 'staff',
              amountDelta: dto.amount,
              metadata: {
                paymentId: payment.id,
                method: dto.method,
                note: dto.note ?? null,
              },
            },
          },
          auditLogs: {
            create: {
              restaurantId: order.restaurantId,
              tableId: order.tableId,
              action: 'payment.created',
              operatorType: 'staff',
              summary: `记录收款 ${dto.amount}`,
              metadata: {
                paymentId: payment.id,
                method: dto.method,
                note: dto.note ?? null,
              },
            },
          },
          printJobs: {
            create: {
              restaurantId: order.restaurantId,
              tableId: order.tableId,
              jobType: PRINT_JOB_TYPES.receiptPayment,
              title: `收款 ${order.orderNo}`,
              payload: {
                orderNo: order.orderNo,
                method: dto.method,
                amount: dto.amount,
                note: dto.note ?? null,
              },
            },
          },
        },
        include: {
          items: true,
          payments: true,
          table: true,
        },
      });

      this.publishMany(['staff.tables.updated', 'admin.reports.updated', 'print.updated']);
      return updatedOrder;
    });
  }

  async addItem(orderId: string, dto: AddOrderItemDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { table: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'cancelled' || order.paymentStatus === 'paid') {
      throw new BadRequestException('Cannot add items to a closed order');
    }

    const menuItem = await this.prisma.menuItem.findFirst({
      where: {
        id: dto.menuItemId,
        restaurantId: order.restaurantId,
        status: 'active',
      },
      include: { options: true },
    });

    if (!menuItem) {
      throw new BadRequestException(`Menu item is unavailable: ${dto.menuItemId}`);
    }

    const selectedOptions = this.resolveOptions(menuItem.options, dto.options);
    const unitPrice = menuItem.price + selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0);
    const amountDelta = unitPrice * dto.quantity;
    if (order.status === 'served' || order.status === 'ready') {
      this.stateMachine.assertOrderTransition(order.status, 'accepted');
    }
    this.stateMachine.assertTableTransition(order.table.status, 'dining');

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: menuItem.id,
          nameSnapshot: menuItem.name,
          priceSnapshot: unitPrice,
          quantity: dto.quantity,
          optionsSnapshot: selectedOptions.length ? selectedOptions : Prisma.JsonNull,
          kitchenStation: menuItem.kitchenStation,
          remark: dto.remark,
          events: {
            create: {
              orderId,
              eventType: 'order_item.added',
              toStatus: 'submitted',
              amountDelta,
              operatorType: 'staff',
              reason: dto.remark,
            },
          },
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          subtotalAmount: { increment: amountDelta },
          totalAmount: { increment: amountDelta },
          status: order.status === 'served' || order.status === 'ready' ? 'accepted' : order.status,
          auditLogs: {
            create: {
              restaurantId: order.restaurantId,
              tableId: order.tableId,
              action: 'order_item.added',
              operatorType: 'staff',
              summary: `加菜 ${menuItem.name} x ${dto.quantity}`,
              metadata: { orderItemId: item.id, amountDelta, remark: dto.remark ?? null },
            },
          },
          printJobs: {
            create: {
              restaurantId: order.restaurantId,
              tableId: order.tableId,
              orderItemId: item.id,
              jobType: PRINT_JOB_TYPES.kitchenAddItem,
              title: `加菜 ${order.table.name}`,
              payload: {
                orderNo: order.orderNo,
                tableName: order.table.name,
                itemName: menuItem.name,
                quantity: dto.quantity,
                remark: dto.remark ?? null,
                kitchenStation: menuItem.kitchenStation,
              },
            },
          },
        },
      });

      await this.ledger.createItemSale(tx, {
        restaurantId: order.restaurantId,
        tableId: order.tableId,
        orderId,
        orderItemId: item.id,
        amount: amountDelta,
        sourceId: item.id,
        note: `加菜 ${menuItem.name} x ${dto.quantity}`,
        metadata: {
          orderNo: order.orderNo,
          tableName: order.table.name,
          remark: dto.remark ?? null,
        },
      });

      await tx.diningTable.update({
        where: { id: order.tableId },
        data: { status: 'dining' },
      });

      this.publishMany(['staff.tables.updated', 'kitchen.updated', 'admin.reports.updated', 'print.updated']);
      return { ...item, order: updatedOrder };
    });
  }

  async createPaymentIntent(orderId: string, dto: CreatePaymentIntentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, table: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot create a payment intent for a cancelled order');
    }

    const availableAmount = this.calculateAvailablePaymentAmount(order);
    if (availableAmount <= 0) {
      throw new BadRequestException('Order is already fully covered');
    }

    if (dto.amount > availableAmount) {
      throw new BadRequestException(`Payment intent amount exceeds remaining amount: ${availableAmount}`);
    }

    const payment = await this.prisma.$transaction((tx) =>
      tx.payment.create({
        data: {
          orderId,
          method: dto.method,
          amount: dto.amount,
          channel: 'online',
          status: 'pending',
          merchantTradeNo: this.createMerchantTradeNo(order.orderNo),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          rawPayload: {
            mock: true,
            orderNo: order.orderNo,
          },
        },
      }),
    );

    this.publishMany(['staff.tables.updated']);
    return this.toPaymentIntentResponse(payment);
  }

  async findPaymentIntent(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment intent not found');
    }

    return this.toPaymentIntentResponse(payment);
  }

  async markPaymentIntentPaid(paymentId: string, dto: MarkPaymentIntentPaidDto): Promise<any> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { payments: true, table: true } } },
    });

    if (!payment) {
      throw new NotFoundException('Payment intent not found');
    }

    if (payment.channel !== 'online') {
      throw new BadRequestException('Only online payment intents can be marked paid');
    }

    if (payment.status === 'paid') {
      return payment;
    }

    if (payment.status === 'closed') {
      throw new BadRequestException('Closed payment intent cannot be marked paid');
    }

    if (payment.status !== 'pending') {
      throw new BadRequestException(`Payment intent cannot be marked paid from ${payment.status}`);
    }

    const order = payment.order;
    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot pay a cancelled order');
    }

    const netPaidAmount = this.calculateNetPaidAmount(order.payments);
    const remainingAmount = order.totalAmount - netPaidAmount;
    if (payment.amount > remainingAmount) {
      throw new BadRequestException(`Payment amount exceeds remaining amount: ${remainingAmount}`);
    }

    const nextPaidAmount = netPaidAmount + payment.amount;
    const nextPaymentStatus = nextPaidAmount >= order.totalAmount ? 'paid' : 'partially_paid';
    this.stateMachine.assertPaymentTransition(order.paymentStatus, nextPaymentStatus);
    if (nextPaymentStatus === 'paid') {
      this.stateMachine.assertTableTransition(order.table.status, 'paying');
    }
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'paid',
          paidAt: now,
          providerTradeNo: dto.providerTradeNo,
          rawPayload: {
            mock: true,
            providerTradeNo: dto.providerTradeNo ?? null,
            markedPaidAt: now.toISOString(),
          },
        },
      });

      await this.ledger.createPaymentReceived(tx, {
        restaurantId: order.restaurantId,
        tableId: order.tableId,
        orderId: order.id,
        paymentId,
        amount: payment.amount,
        sourceId: paymentId,
        note: `Online payment ${payment.method}`,
        occurredAt: now,
        metadata: {
          orderNo: order.orderNo,
          method: payment.method,
          merchantTradeNo: payment.merchantTradeNo ?? null,
          providerTradeNo: dto.providerTradeNo ?? null,
        },
      });

      if (nextPaymentStatus === 'paid') {
        await tx.diningTable.update({
          where: { id: order.tableId },
          data: { status: 'paying' },
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: nextPaymentStatus,
          paidAt: nextPaymentStatus === 'paid' ? now : null,
          events: {
            create: {
              eventType: 'payment.intent.paid',
              operatorType: 'system',
              amountDelta: payment.amount,
              metadata: {
                paymentId,
                method: payment.method,
                merchantTradeNo: payment.merchantTradeNo ?? null,
                providerTradeNo: dto.providerTradeNo ?? null,
              },
            },
          },
          auditLogs: {
            create: {
              restaurantId: order.restaurantId,
              tableId: order.tableId,
              action: 'payment.intent.paid',
              operatorType: 'system',
              summary: `Online payment confirmed ${payment.amount}`,
              metadata: {
                paymentId,
                method: payment.method,
                merchantTradeNo: payment.merchantTradeNo ?? null,
                providerTradeNo: dto.providerTradeNo ?? null,
              },
            },
          },
        },
        include: { items: true, payments: true, table: true },
      });

      this.publishMany(['staff.tables.updated', 'admin.reports.updated']);
      return updatedOrder ?? updatedPayment;
    });
  }

  async closePaymentIntent(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment) {
      throw new NotFoundException('Payment intent not found');
    }

    if (payment.channel !== 'online') {
      throw new BadRequestException('Only online payment intents can be closed');
    }

    if (payment.status !== 'pending') {
      throw new BadRequestException(`Payment intent cannot be closed from ${payment.status}`);
    }

    const updated = await this.prisma.$transaction((tx) =>
      tx.payment.update({
        where: { id: paymentId },
        data: { status: 'closed' },
      }),
    );

    this.publishMany(['staff.tables.updated']);
    return updated;
  }

  async handleMockPaymentWebhook(dto: MockPaymentWebhookDto) {
    const expectedSecret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET ?? 'tablelink-mock-secret';
    if (dto.secret !== expectedSecret) {
      throw new BadRequestException('Invalid mock payment webhook secret');
    }

    return this.markPaymentIntentPaid(dto.paymentId, { providerTradeNo: dto.providerTradeNo });
  }

  async createAdjustment(orderId: string, dto: CreateOrderAdjustmentDto) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Adjustment reason is required');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, table: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot adjust a cancelled order');
    }

    if (order.paymentStatus === 'paid') {
      throw new BadRequestException('Cannot adjust a paid order');
    }

    const netPaidAmount = this.calculateNetPaidAmount(order.payments);
    const isDecrease = this.isDecreaseAdjustment(dto.type);
    const amountDelta = isDecrease ? -dto.amount : dto.amount;
    const nextTotalAmount = order.totalAmount + amountDelta;

    if (nextTotalAmount < 0) {
      throw new BadRequestException('Adjustment exceeds order total');
    }

    if (nextTotalAmount < netPaidAmount) {
      throw new BadRequestException('Adjustment would reduce total below paid amount');
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.orderEvent.create({
        data: {
          orderId,
          eventType: `order.adjustment.${dto.type}`,
          amountDelta,
          operatorType: 'staff',
          reason,
          metadata: {
            adjustmentType: dto.type,
            ledgerEntryType: isDecrease ? 'discount' : 'adjustment',
          },
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: isDecrease
          ? {
              discountAmount: { increment: dto.amount },
              totalAmount: { increment: amountDelta },
            }
          : {
              totalAmount: { increment: amountDelta },
            },
        include: { items: true, payments: true, table: true },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: order.restaurantId,
          tableId: order.tableId,
          orderId,
          action: `order.adjustment.${dto.type}`,
          operatorType: 'staff',
          summary: `${isDecrease ? 'Discount' : 'Adjustment'} ${dto.amount}`,
          metadata: {
            adjustmentType: dto.type,
            amount: dto.amount,
            amountDelta,
            reason,
          },
        },
      });

      const ledgerInput = {
        restaurantId: order.restaurantId,
        tableId: order.tableId,
        orderId,
        amount: dto.amount,
        sourceId: event.id,
        note: reason,
        metadata: {
          orderNo: order.orderNo,
          tableName: order.table.name,
          adjustmentType: dto.type,
          amountDelta,
        },
      };

      if (isDecrease) {
        await this.ledger.createDiscount(tx, ledgerInput);
      } else {
        await this.ledger.createAdjustment(tx, ledgerInput);
      }

      this.publishMany(['staff.tables.updated', 'admin.reports.updated']);
      return updatedOrder;
    });
  }

  async reopenOrder(orderId: string, dto: ReopenOrderDto) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Reopen reason is required');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, table: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot reopen a cancelled order');
    }

    if (order.paymentStatus !== 'paid') {
      throw new BadRequestException('Only paid orders can be reopened');
    }

    const netPaidAmount = this.calculateNetPaidAmount(order.payments);
    this.stateMachine.assertPaymentTransition(order.paymentStatus, 'partially_paid');

    return this.prisma.$transaction(async (tx) => {
      await tx.orderEvent.create({
        data: {
          orderId,
          eventType: 'payment.reopened',
          operatorType: 'staff',
          reason,
          metadata: {
            previousPaymentStatus: order.paymentStatus,
            netPaidAmount,
            totalAmount: order.totalAmount,
            reason,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: order.restaurantId,
          tableId: order.tableId,
          orderId,
          action: 'order.reopened',
          operatorType: 'staff',
          summary: `Reopened paid order ${order.orderNo}`,
          metadata: {
            previousPaymentStatus: order.paymentStatus,
            netPaidAmount,
            totalAmount: order.totalAmount,
            reason,
          },
        },
      });

      await tx.diningTable.update({
        where: { id: order.tableId },
        data: { status: 'paying' },
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'partially_paid', paidAt: null },
        include: { items: true, payments: true, table: true },
      });

      this.publishMany(['staff.tables.updated', 'admin.reports.updated']);
      return updatedOrder;
    });
  }

  async refundItem(orderId: string, orderItemId: string, dto: ReasonDto) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      include: { order: { include: { table: true } } },
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    if (['cancelled', 'refunded'].includes(item.status)) {
      throw new BadRequestException('Order item is already closed');
    }

    this.stateMachine.assertOrderItemTransition(item.status, 'refunded');
    const amountDelta = -(item.priceSnapshot * item.quantity);

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          status: 'refunded',
          events: {
            create: {
              orderId,
              eventType: 'order_item.refunded',
              fromStatus: item.status,
              toStatus: 'refunded',
              amountDelta,
              operatorType: 'staff',
              reason: dto.reason,
            },
          },
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotalAmount: { increment: amountDelta },
          totalAmount: { increment: amountDelta },
          auditLogs: {
            create: {
              restaurantId: item.order.restaurantId,
              tableId: item.order.tableId,
              action: 'order_item.refunded',
              operatorType: 'staff',
              summary: `退菜 ${item.nameSnapshot} x ${item.quantity}`,
              metadata: { orderItemId, amountDelta, reason: dto.reason ?? null },
            },
          },
          printJobs: {
            create: {
              restaurantId: item.order.restaurantId,
              tableId: item.order.tableId,
              orderItemId,
              jobType: PRINT_JOB_TYPES.kitchenRefundItem,
              title: `退菜 ${item.order.table.name}`,
              payload: {
                orderNo: item.order.orderNo,
                tableName: item.order.table.name,
                itemName: item.nameSnapshot,
                quantity: item.quantity,
                reason: dto.reason ?? null,
              },
            },
          },
        },
      });

      await this.ledger.createItemVoid(tx, {
        restaurantId: item.order.restaurantId,
        tableId: item.order.tableId,
        orderId,
        orderItemId,
        amount: Math.abs(amountDelta),
        sourceId: orderItemId,
        note: `退菜 ${item.nameSnapshot} x ${item.quantity}`,
        metadata: {
          orderNo: item.order.orderNo,
          tableName: item.order.table.name,
          reason: dto.reason ?? null,
        },
      });

      this.publishMany(['staff.tables.updated', 'kitchen.updated', 'admin.reports.updated', 'print.updated']);
      return updatedItem;
    });
  }

  async urgeItem(orderId: string, orderItemId: string, dto: ReasonDto) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      include: { order: { include: { table: true } } },
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.orderEvent.create({
        data: {
          orderId,
          orderItemId,
          eventType: 'order_item.urged',
          operatorType: 'staff',
          reason: dto.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: item.order.restaurantId,
          tableId: item.order.tableId,
          orderId,
          action: 'order_item.urged',
          operatorType: 'staff',
          summary: `催菜 ${item.nameSnapshot}`,
          metadata: { orderItemId, reason: dto.reason ?? null },
        },
      });

      await tx.printJob.create({
        data: {
          restaurantId: item.order.restaurantId,
          tableId: item.order.tableId,
          orderId,
          orderItemId,
          jobType: PRINT_JOB_TYPES.kitchenUrge,
          title: `催菜 ${item.order.table.name}`,
          payload: {
            orderNo: item.order.orderNo,
            tableName: item.order.table.name,
            itemName: item.nameSnapshot,
            quantity: item.quantity,
            reason: dto.reason ?? null,
          },
        },
      });

      this.realtime.publish({ type: 'print.updated' });
      return item;
    });
  }

  async holdItem(orderId: string, orderItemId: string, dto: HoldOrderItemDto) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      include: { order: { include: { table: true } } },
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    if (['ready', 'served', 'cancelled', 'refunded'].includes(item.status)) {
      throw new BadRequestException('Only pending kitchen items can be held or resumed');
    }

    const nextStatus = dto.hold ? 'held' : 'submitted';
    this.stateMachine.assertOrderItemTransition(item.status, nextStatus);
    const eventType = dto.hold ? 'order_item.held' : 'order_item.resumed';

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          status: nextStatus,
          events: {
            create: {
              orderId,
              eventType,
              fromStatus: item.status,
              toStatus: nextStatus,
              operatorType: 'staff',
              reason: dto.reason,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: item.order.restaurantId,
          tableId: item.order.tableId,
          orderId,
          action: eventType,
          operatorType: 'staff',
          summary: `${dto.hold ? '等叫' : '恢复制作'} ${item.nameSnapshot}`,
          metadata: { orderItemId, reason: dto.reason ?? null },
        },
      });

      await tx.printJob.create({
        data: {
          restaurantId: item.order.restaurantId,
          tableId: item.order.tableId,
          orderId,
          orderItemId,
          jobType: dto.hold ? PRINT_JOB_TYPES.kitchenHold : PRINT_JOB_TYPES.kitchenResume,
          title: `${dto.hold ? '等叫' : '恢复'} ${item.order.table.name}`,
          payload: {
            orderNo: item.order.orderNo,
            tableName: item.order.table.name,
            itemName: item.nameSnapshot,
            quantity: item.quantity,
            reason: dto.reason ?? null,
          },
        },
      });

      this.realtime.publish({ type: 'print.updated' });
      return updatedItem;
    });
  }

  async refundPayment(orderId: string, dto: RefundPaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, table: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const netPaidAmount = this.calculateNetPaidAmount(order.payments);
    if (dto.amount > netPaidAmount) {
      throw new BadRequestException(`Refund amount exceeds paid amount: ${netPaidAmount}`);
    }

    const nextNetPaid = netPaidAmount - dto.amount;
    const nextPaymentStatus = nextNetPaid <= 0 ? 'refunded' : nextNetPaid >= order.totalAmount ? 'paid' : 'partially_paid';
    this.stateMachine.assertPaymentTransition(order.paymentStatus, nextPaymentStatus);

    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.payment.create({
        data: {
          orderId,
          method: dto.method,
          amount: dto.amount,
          status: 'refunded',
          paidAt: new Date(),
        },
      });

      await this.ledger.createPaymentRefund(tx, {
        restaurantId: order.restaurantId,
        tableId: order.tableId,
        orderId,
        paymentId: refund.id,
        amount: dto.amount,
        sourceId: refund.id,
        note: `退款 ${dto.method}`,
        metadata: {
          orderNo: order.orderNo,
          tableName: order.table.name,
          reason: dto.reason ?? null,
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: nextPaymentStatus,
          paidAt: nextPaymentStatus === 'paid' ? order.paidAt : null,
          events: {
            create: {
              eventType: 'payment.refunded',
              operatorType: 'staff',
              amountDelta: -dto.amount,
              reason: dto.reason,
              metadata: { paymentId: refund.id, method: dto.method },
            },
          },
          auditLogs: {
            create: {
              restaurantId: order.restaurantId,
              tableId: order.tableId,
              action: 'payment.refunded',
              operatorType: 'staff',
              summary: `退款 ${dto.amount}`,
              metadata: { paymentId: refund.id, method: dto.method, reason: dto.reason ?? null },
            },
          },
          printJobs: {
            create: {
              restaurantId: order.restaurantId,
              tableId: order.tableId,
              jobType: PRINT_JOB_TYPES.receiptRefund,
              title: `退款 ${order.orderNo}`,
              payload: {
                orderNo: order.orderNo,
                tableName: order.table.name,
                method: dto.method,
                amount: dto.amount,
                reason: dto.reason ?? null,
              },
            },
          },
        },
        include: { items: true, payments: true, table: true },
      });

      this.publishMany(['staff.tables.updated', 'admin.reports.updated', 'print.updated']);
      return updatedOrder;
    });
  }

  findAuditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { table: true, order: true },
    });
  }

  findPrintJobs() {
    return this.prisma.printJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { table: true, order: true, orderItem: true },
    });
  }

  private resolveOptions(
    menuOptions: { name: string; type: 'single' | 'multiple'; required: boolean; values: Prisma.JsonValue }[],
    selected: { optionName: string; valueName: string }[] = [],
  ) {
    const normalizedSelections = selected ?? [];
    const resolved: { optionName: string; valueName: string; priceDelta: number }[] = [];

    for (const option of menuOptions) {
      const optionValues = normalizeMenuOptionValues(option.values);
      const selections = normalizedSelections.filter((selection) => selection.optionName === option.name);

      if (option.required && selections.length === 0) {
        throw new BadRequestException(`Option ${option.name} is required`);
      }

      if (option.type === 'single' && selections.length > 1) {
        throw new BadRequestException(`Option ${option.name} allows only one value`);
      }

      for (const selection of selections) {
        const value = optionValues.find((candidate) => candidate.name === selection.valueName);
        if (!value) {
          throw new BadRequestException(`Invalid option: ${selection.optionName}/${selection.valueName}`);
        }

        resolved.push({
          optionName: option.name,
          valueName: value.name,
          priceDelta: value.priceDelta,
        });
      }
    }

    const knownOptionNames = new Set(menuOptions.map((option) => option.name));
    const unknownSelection = normalizedSelections.find((selection) => !knownOptionNames.has(selection.optionName));
    if (unknownSelection) {
      throw new BadRequestException(`Invalid option: ${unknownSelection.optionName}/${unknownSelection.valueName}`);
    }

    return resolved;
  }

  private createOrderNo() {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${ymd}-${suffix}`;
  }

  private createCustomerAccessToken() {
    return randomBytes(32).toString('base64url');
  }

  private createMerchantTradeNo(orderNo: string) {
    return `MOCK-${orderNo}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private toPaymentIntentResponse(payment: { id: string; status: string; method: string; amount: number; merchantTradeNo?: string | null }) {
    return {
      paymentId: payment.id,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      merchantTradeNo: payment.merchantTradeNo ?? null,
      mockQrCodeUrl: null,
    };
  }

  private safeEqualCustomerAccessToken(token: string, hash: string) {
    const actual = Buffer.from(this.hashCustomerAccessToken(token));
    const expected = Buffer.from(hash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private publishMany(types: ('kitchen.updated' | 'service.updated' | 'staff.tables.updated' | 'admin.reports.updated' | 'print.updated')[]) {
    for (const type of types) {
      this.realtime.publish({ type });
    }
  }

  private isDecreaseAdjustment(type: OrderAdjustmentType) {
    return type === 'discount' || type === 'rounding' || type === 'comp';
  }

  private calculateNetPaidAmount(payments: { amount: number; status: string }[]) {
    const paidAmount = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
    const refundedAmount = payments.filter((payment) => payment.status === 'refunded').reduce((sum, payment) => sum + payment.amount, 0);
    return paidAmount - refundedAmount;
  }

  private calculateAvailablePaymentAmount(order: { totalAmount: number; payments: { amount: number; status: string; channel?: string }[] }) {
    const netPaidAmount = this.calculateNetPaidAmount(order.payments);
    const pendingOnlineAmount = order.payments.filter((payment) => payment.channel === 'online' && payment.status === 'pending').reduce((sum, payment) => sum + payment.amount, 0);
    return order.totalAmount - netPaidAmount - pendingOnlineAmount;
  }
}
