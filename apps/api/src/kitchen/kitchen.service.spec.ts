import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StateMachineService } from '../workflow/state-machine.service';
import { KitchenService } from './kitchen.service';

function createService() {
  const tx = {
    orderItem: {
      update: vi.fn(),
      count: vi.fn(),
    },
    order: {
      update: vi.fn(),
    },
  };
  const prisma = {
    orderItem: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(tx)),
  };
  const realtime = {
    publish: vi.fn(),
  };

  return {
    prisma,
    tx,
    realtime,
    service: new KitchenService(prisma as unknown as PrismaService, new StateMachineService(), realtime as unknown as RealtimeService),
  };
}

describe('KitchenService realtime events', () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it('publishes service updates when an item is marked ready', async () => {
    const { prisma, tx, realtime, service } = context;
    prisma.orderItem.findUnique.mockResolvedValue({
      id: 'item-1',
      orderId: 'order-1',
      status: 'cooking',
      order: { id: 'order-1', status: 'cooking' },
    });
    tx.orderItem.update.mockResolvedValue({ id: 'item-1', status: 'ready' });
    tx.orderItem.count.mockResolvedValue(1);

    await service.markItemReady('item-1');

    expect(realtime.publish).toHaveBeenCalledWith({ type: 'kitchen.updated' });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'service.updated' });
  });
});
