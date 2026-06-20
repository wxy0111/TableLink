import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KitchenStation, OrderItemStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StateMachineService } from '../workflow/state-machine.service';

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly realtime: RealtimeService,
  ) {}

  findOrders(filter: { station?: KitchenStation; status?: OrderItemStatus }) {
    return this.prisma.order.findMany({
      where: {
        status: { not: 'cancelled' },
        items: {
          some: {
            kitchenStation: filter.station,
            status: filter.status,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        table: true,
        items: {
          where: {
            kitchenStation: filter.station,
            status: filter.status,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findTasks(filter: { station?: KitchenStation }) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        status: { in: ['submitted', 'accepted', 'cooking'] },
        kitchenStation: filter.station,
        order: {
          status: { not: 'cancelled' },
        },
      },
      include: {
        order: {
          include: {
            table: true,
            items: true,
            serviceCalls: {
              where: { status: { in: ['open', 'acknowledged'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const now = Date.now();
    return items
      .map((item) => {
        const ageMinutes = Math.max(0, Math.floor((now - item.createdAt.getTime()) / 60000));
        const activeUnservedItems = item.order.items.filter((orderItem) => {
          return !['ready', 'served', 'cancelled', 'refunded'].includes(orderItem.status);
        });
        const isLastUnreadyItem = activeUnservedItems.length === 1 && activeUnservedItems[0].id === item.id;
        const hasActiveServiceCall = item.order.serviceCalls.length > 0;
        const priorityScore = this.calculatePriorityScore(ageMinutes, isLastUnreadyItem, hasActiveServiceCall, item.status);

        return {
          id: item.id,
          orderId: item.orderId,
          orderNo: item.order.orderNo,
          tableName: item.order.table.name,
          name: item.nameSnapshot,
          quantity: item.quantity,
          remark: item.remark,
          status: item.status,
          kitchenStation: item.kitchenStation,
          createdAt: item.createdAt,
          cookingStartedAt: item.cookingStartedAt,
          ageMinutes,
          urgency: this.getUrgency(ageMinutes),
          priorityScore,
          isLastUnreadyItem,
          hasActiveServiceCall,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore || b.ageMinutes - a.ageMinutes);
  }

  async startItem(orderItemId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: true },
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    if (!['submitted', 'accepted'].includes(item.status)) {
      throw new BadRequestException('Only submitted or accepted items can start cooking');
    }
    this.stateMachine.assertOrderItemTransition(item.status, 'cooking');
    this.stateMachine.assertOrderTransition(item.order.status, 'cooking');

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          status: 'cooking',
          cookingStartedAt: new Date(),
          events: {
            create: {
              orderId: item.orderId,
              eventType: 'order_item.cooking_started',
              fromStatus: item.status,
              toStatus: 'cooking',
              operatorType: 'staff',
            },
          },
        },
      });

      await tx.order.update({
        where: { id: item.orderId },
        data: { status: 'cooking' },
      });

      this.realtime.publish({ type: 'kitchen.updated' });
      return updatedItem;
    });
  }

  async markItemReady(orderItemId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: true },
    });

    if (!item) {
      throw new NotFoundException('Order item not found');
    }

    if (!['submitted', 'accepted', 'cooking'].includes(item.status)) {
      throw new BadRequestException('Only active kitchen items can be marked ready');
    }
    this.stateMachine.assertOrderItemTransition(item.status, 'ready');

    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          status: 'ready',
          readyAt: new Date(),
          events: {
            create: {
              orderId: item.orderId,
              eventType: 'order_item.ready',
              fromStatus: item.status,
              toStatus: 'ready',
              operatorType: 'staff',
            },
          },
        },
      });

      const remainingActiveItems = await tx.orderItem.count({
        where: {
          orderId: item.orderId,
          status: { in: ['submitted', 'accepted', 'cooking'] },
        },
      });

      if (remainingActiveItems === 0) {
        this.stateMachine.assertOrderTransition(item.order.status, 'ready');
        await tx.order.update({
          where: { id: item.orderId },
          data: { status: 'ready' },
        });
      }

      this.realtime.publish({ type: 'kitchen.updated' });
      this.realtime.publish({ type: 'service.updated' });
      return updatedItem;
    });
  }

  private calculatePriorityScore(ageMinutes: number, isLastUnreadyItem: boolean, hasActiveServiceCall: boolean, status: OrderItemStatus) {
    let score = ageMinutes;
    if (ageMinutes >= 20) score += 60;
    else if (ageMinutes >= 10) score += 30;
    else if (ageMinutes >= 5) score += 10;

    if (isLastUnreadyItem) score += 25;
    if (hasActiveServiceCall) score += 10;
    if (status === 'cooking') score += 15;

    return score;
  }

  private getUrgency(ageMinutes: number) {
    if (ageMinutes >= 20) return 'red';
    if (ageMinutes >= 10) return 'orange';
    if (ageMinutes >= 5) return 'yellow';
    return 'green';
  }
}
