import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StateMachineService } from '../workflow/state-machine.service';
import { TablesService } from './tables.service';

function createService() {
  const tx = {
    auditLog: { create: vi.fn() },
    printJob: { create: vi.fn() },
    diningTable: { update: vi.fn() },
  };
  const prisma = {
    diningTable: {
      findUnique: vi.fn(),
    },
    order: {
      count: vi.fn(),
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
    service: new TablesService(prisma as unknown as PrismaService, new StateMachineService(), realtime as unknown as RealtimeService),
  };
}

describe('TablesService', () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it('rejects clearing a table that has unpaid orders', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({ id: 'table-1', restaurantId: 'restaurant-1', name: 'A01', status: 'dining' });
    prisma.order.count.mockResolvedValue(1);

    await expect(service.clearTable('table-1', {})).rejects.toThrow(BadRequestException);
  });

  it('clears a paid table to idle and writes an audit log', async () => {
    const { prisma, tx, realtime, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({ id: 'table-1', restaurantId: 'restaurant-1', name: 'A01', status: 'paying' });
    prisma.order.count.mockResolvedValue(0);
    tx.diningTable.update.mockResolvedValue({ id: 'table-1', status: 'idle' });

    const table = await service.clearTable('table-1', { reason: 'paid and left' });

    expect(table.status).toBe('idle');
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'table.cleared',
          tableId: 'table-1',
          metadata: { reason: 'paid and left' },
        }),
      }),
    );
    expect(tx.diningTable.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'idle' } });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'staff.tables.updated' });
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'admin.reports.updated' });
  });

  it('blocks clearing a table after a paid order has been reopened', async () => {
    const { prisma, service } = context;
    prisma.diningTable.findUnique.mockResolvedValue({ id: 'table-1', restaurantId: 'restaurant-1', name: 'A01', status: 'paying' });
    prisma.order.count.mockResolvedValue(1);

    await expect(service.clearTable('table-1', { reason: 'still reopened' })).rejects.toThrow(BadRequestException);
    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paymentStatus: { in: ['unpaid', 'partially_paid'] } }),
      }),
    );
  });
});
