import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { StateMachineService } from './state-machine.service';

describe('StateMachineService', () => {
  const service = new StateMachineService();

  it('allows legal order status transitions', () => {
    expect(() => service.assertOrderTransition('submitted', 'accepted')).not.toThrow();
    expect(() => service.assertOrderTransition('accepted', 'cooking')).not.toThrow();
    expect(() => service.assertOrderTransition('cooking', 'ready')).not.toThrow();
    expect(() => service.assertOrderTransition('ready', 'served')).not.toThrow();
  });

  it('rejects illegal order status transitions', () => {
    expect(() => service.assertOrderTransition('cancelled', 'accepted')).toThrow(BadRequestException);
  });

  it('allows legal order item status transitions', () => {
    expect(() => service.assertOrderItemTransition('submitted', 'held')).not.toThrow();
    expect(() => service.assertOrderItemTransition('held', 'submitted')).not.toThrow();
    expect(() => service.assertOrderItemTransition('ready', 'served')).not.toThrow();
    expect(() => service.assertOrderItemTransition('served', 'refunded')).not.toThrow();
  });

  it('rejects illegal order item status transitions', () => {
    expect(() => service.assertOrderItemTransition('refunded', 'served')).toThrow(BadRequestException);
  });

  it('allows legal payment status transitions', () => {
    expect(() => service.assertPaymentTransition('unpaid', 'partially_paid')).not.toThrow();
    expect(() => service.assertPaymentTransition('partially_paid', 'paid')).not.toThrow();
    expect(() => service.assertPaymentTransition('paid', 'refunded')).not.toThrow();
  });

  it('rejects illegal payment status transitions', () => {
    expect(() => service.assertPaymentTransition('unpaid', 'unpaid')).not.toThrow();
    expect(() => service.assertPaymentTransition('refunded', 'unpaid')).toThrow(BadRequestException);
  });

  it('allows legal table status transitions', () => {
    expect(() => service.assertTableTransition('idle', 'occupied')).not.toThrow();
    expect(() => service.assertTableTransition('occupied', 'dining')).not.toThrow();
    expect(() => service.assertTableTransition('dining', 'paying')).not.toThrow();
    expect(() => service.assertTableTransition('paying', 'idle')).not.toThrow();
  });

  it('rejects illegal table status transitions', () => {
    expect(() => service.assertTableTransition('idle', 'paying')).toThrow(BadRequestException);
  });
});
