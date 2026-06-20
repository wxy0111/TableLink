import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateServiceCallDto } from './dto/create-service-call.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StateMachineService } from '../workflow/state-machine.service';

@Injectable()
export class ServiceTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly realtime: RealtimeService,
  ) {}

  async getCurrentServiceCall(tableCode: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { code: tableCode } });
    if (!table) {
      throw new NotFoundException('Table not found');
    }

    return this.prisma.serviceCall.findFirst({
      where: {
        tableId: table.id,
        status: { in: ['open', 'acknowledged'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createServiceCall(tableCode: string, dto: CreateServiceCallDto) {
    const table = await this.prisma.diningTable.findUnique({
      where: { code: tableCode },
      include: {
        orders: {
          where: { status: { not: 'cancelled' }, paymentStatus: { not: 'paid' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    const existingCall = await this.prisma.serviceCall.findFirst({
      where: {
        tableId: table.id,
        status: { in: ['open', 'acknowledged'] },
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingCall) {
      return existingCall;
    }

    const call = await this.prisma.serviceCall.create({
      data: {
        restaurantId: table.restaurantId,
        tableId: table.id,
        orderId: table.orders[0]?.id,
        status: 'open',
        message: dto.message ?? '顾客呼叫服务员',
      },
      include: { table: true },
    });

    this.realtime.publish({ type: 'service.updated' });
    return call;
  }

  async getTasks() {
    const [calls, readyItems] = await Promise.all([
      this.prisma.serviceCall.findMany({
        where: { status: { in: ['open', 'acknowledged'] } },
        include: { table: true, order: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.orderItem.findMany({
        where: {
          status: 'ready',
          order: { status: { not: 'cancelled' } },
        },
        include: {
          order: { include: { table: true } },
        },
        orderBy: { readyAt: 'asc' },
      }),
    ]);

    const now = Date.now();

    return {
      calls: calls.map((call) => ({
        id: call.id,
        tableName: call.table.name,
        orderNo: call.order?.orderNo ?? null,
        status: call.status,
        message: call.message,
        createdAt: call.createdAt,
        waitMinutes: Math.max(0, Math.floor((now - call.createdAt.getTime()) / 60000)),
      })),
      readyItems: readyItems.map((item) => ({
        id: item.id,
        tableName: item.order.table.name,
        orderNo: item.order.orderNo,
        name: item.nameSnapshot,
        quantity: item.quantity,
        remark: item.remark,
        readyAt: item.readyAt,
        waitMinutes: item.readyAt ? Math.max(0, Math.floor((now - item.readyAt.getTime()) / 60000)) : 0,
      })),
    };
  }

  async acknowledgeCall(serviceCallId: string) {
    return this.updateCall(serviceCallId, 'acknowledged');
  }

  async resolveCall(serviceCallId: string) {
    return this.updateCall(serviceCallId, 'resolved');
  }

  async markItemServed(orderItemId: string) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: orderItemId }, include: { order: true } });
    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    if (item.status !== 'ready') {
      throw new BadRequestException('Only ready items can be served');
    }
    this.stateMachine.assertOrderItemTransition(item.status, 'served');

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          status: 'served',
          servedAt: new Date(),
          events: {
            create: {
              orderId: item.orderId,
              eventType: 'order_item.served',
              fromStatus: 'ready',
              toStatus: 'served',
              operatorType: 'staff',
            },
          },
        },
      });

      const unservedCount = await tx.orderItem.count({
        where: {
          orderId: item.orderId,
          status: { in: ['submitted', 'accepted', 'cooking', 'ready'] },
        },
      });

      if (unservedCount === 0) {
        this.stateMachine.assertOrderTransition(item.order.status, 'served');
        await tx.order.update({
          where: { id: item.orderId },
          data: { status: 'served' },
        });
      }

      this.realtime.publish({ type: 'service.updated' });
      this.realtime.publish({ type: 'staff.tables.updated' });
      return updatedItem;
    });
  }

  private async updateCall(serviceCallId: string, status: 'acknowledged' | 'resolved') {
    const call = await this.prisma.serviceCall.findUnique({ where: { id: serviceCallId } });
    if (!call) {
      throw new NotFoundException('Service call not found');
    }

    const updatedCall = await this.prisma.serviceCall.update({
      where: { id: serviceCallId },
      data: {
        status,
        acknowledgedAt: status === 'acknowledged' ? new Date() : call.acknowledgedAt,
        resolvedAt: status === 'resolved' ? new Date() : null,
      },
      include: { table: true },
    });

    this.realtime.publish({ type: 'service.updated' });
    this.realtime.publish({ type: 'staff.tables.updated' });
    return updatedCall;
  }
}
