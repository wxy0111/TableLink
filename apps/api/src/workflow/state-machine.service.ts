import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderItemStatus, OrderStatus, PaymentStatus, TableStatus } from '@prisma/client';

@Injectable()
export class StateMachineService {
  assertOrderTransition(from: OrderStatus, to: OrderStatus) {
    this.assertTransition('order', from, to, {
      submitted: ['accepted', 'cooking', 'ready', 'served', 'cancelled'],
      accepted: ['cooking', 'ready', 'served', 'cancelled'],
      cooking: ['ready', 'served', 'cancelled'],
      ready: ['accepted', 'served', 'cancelled'],
      served: ['accepted', 'cancelled'],
      cancelled: [],
    });
  }

  assertOrderItemTransition(from: OrderItemStatus, to: OrderItemStatus) {
    this.assertTransition('order item', from, to, {
      submitted: ['accepted', 'held', 'cooking', 'ready', 'cancelled', 'refunded'],
      accepted: ['held', 'cooking', 'ready', 'cancelled', 'refunded'],
      held: ['submitted', 'accepted', 'cancelled', 'refunded'],
      cooking: ['ready', 'cancelled', 'refunded'],
      ready: ['served', 'cancelled', 'refunded'],
      served: ['refunded'],
      cancelled: [],
      refunded: [],
    });
  }

  assertPaymentTransition(from: PaymentStatus, to: PaymentStatus) {
    this.assertTransition('payment', from, to, {
      unpaid: ['partially_paid', 'paid', 'refunded'],
      partially_paid: ['paid', 'refunded'],
      paid: ['partially_paid', 'refunded'],
      refunded: ['partially_paid', 'paid'],
    });
  }

  assertTableTransition(from: TableStatus, to: TableStatus) {
    this.assertTransition('table', from, to, {
      idle: ['occupied', 'dining', 'closed'],
      occupied: ['dining', 'idle', 'closed'],
      dining: ['paying', 'idle', 'closed'],
      paying: ['dining', 'idle', 'closed'],
      closed: ['idle'],
    });
  }

  private assertTransition<T extends string>(name: string, from: T, to: T, allowed: Record<T, T[]>) {
    if (from === to) return;
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Invalid ${name} status transition: ${from} -> ${to}`);
    }
  }
}
