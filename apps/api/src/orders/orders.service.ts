import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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

    const paidAmount = order.payments
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amount, 0);
    const remainingAmount = order.totalAmount - paidAmount;

    if (remainingAmount <= 0) {
      throw new BadRequestException('Order is already paid');
    }

    if (dto.amount > remainingAmount) {
      throw new BadRequestException(`Payment amount exceeds remaining amount: ${remainingAmount}`);
    }

    const nextPaidAmount = paidAmount + dto.amount;
    const nextPaymentStatus = nextPaidAmount >= order.totalAmount ? 'paid' : 'partially_paid';
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
}
