import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { StateMachineService } from '../workflow/state-machine.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AddOrderItemDto, HoldOrderItemDto, ReasonDto, RefundPaymentDto } from './dto/frontdesk-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly stateMachine: StateMachineService,
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
    this.stateMachine.assertTableTransition(table.status, 'dining');

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          restaurantId: table.restaurantId,
          tableId: table.id,
          orderNo,
          remark: dto.remark,
          subtotalAmount: totalAmount,
          totalAmount,
          items: { create: orderItems },
          events: {
            create: {
              eventType: 'order.created',
              toStatus: 'submitted',
              operatorType: 'customer',
              amountDelta: totalAmount,
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
              jobType: 'receipt_payment',
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
              jobType: 'kitchen_add_item',
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

      return { ...item, order: updatedOrder };
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
              jobType: 'kitchen_refund_item',
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
          jobType: 'kitchen_urge',
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
          jobType: dto.hold ? 'kitchen_hold' : 'kitchen_resume',
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

      return tx.order.update({
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
              jobType: 'receipt_refund',
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

  private resolveOptions(menuOptions: { name: string; values: Prisma.JsonValue }[], selected: { optionName: string; valueName: string }[]) {
    return selected.map((selection) => {
      const option = menuOptions.find((menuOption) => menuOption.name === selection.optionName);
      const values = Array.isArray(option?.values) ? option.values : [];
      const value = values.find((entry): entry is { name: string; priceDelta?: number } => {
        return typeof entry === 'object' && entry !== null && 'name' in entry && entry.name === selection.valueName;
      });

      if (!option || !value) {
        throw new BadRequestException(`Invalid option: ${selection.optionName}/${selection.valueName}`);
      }

      return {
        optionName: selection.optionName,
        valueName: selection.valueName,
        priceDelta: Number(value.priceDelta ?? 0),
      };
    });
  }

  private createOrderNo() {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${ymd}-${suffix}`;
  }

  private calculateNetPaidAmount(payments: { amount: number; status: string }[]) {
    const paidAmount = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
    const refundedAmount = payments.filter((payment) => payment.status === 'refunded').reduce((sum, payment) => sum + payment.amount, 0);
    return paidAmount - refundedAmount;
  }
}
