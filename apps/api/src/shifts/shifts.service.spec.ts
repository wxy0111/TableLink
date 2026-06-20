import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftsService } from './shifts.service';

function createService() {
  const prisma = {
    shift: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    prisma,
    service: new ShiftsService(prisma as unknown as PrismaService),
  };
}

const user: AuthUser = {
  id: 'user-1',
  restaurantId: 'restaurant-1',
  name: 'Cashier',
  phone: '13800000002',
  role: 'cashier',
};

describe('ShiftsService', () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it('opens a shift when no shift is open', async () => {
    const { prisma, service } = context;
    prisma.shift.findFirst.mockResolvedValue(null);
    prisma.shift.create.mockResolvedValue({ id: 'shift-1', status: 'open', openingCashAmount: 50000 });

    const shift = await service.open(user, { openingCashAmount: 50000, note: 'morning' });

    expect(shift.status).toBe('open');
    expect(prisma.shift.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: 'restaurant-1',
          openedByUserId: 'user-1',
          openingCashAmount: 50000,
        }),
      }),
    );
  });

  it('rejects opening a duplicate shift', async () => {
    const { prisma, service } = context;
    prisma.shift.findFirst.mockResolvedValue({ id: 'shift-1', status: 'open' });

    await expect(service.open(user, { openingCashAmount: 0 })).rejects.toThrow(BadRequestException);
  });

  it('closes an open shift and records closing cash amount', async () => {
    const { prisma, service } = context;
    prisma.shift.findFirst.mockResolvedValue({ id: 'shift-1', restaurantId: 'restaurant-1', status: 'open', note: 'morning' });
    prisma.shift.update.mockResolvedValue({ id: 'shift-1', status: 'closed', closingCashAmount: 62000 });

    const shift = await service.close(user, 'shift-1', { closingCashAmount: 62000, note: 'handoff' });

    expect(shift.status).toBe('closed');
    expect(prisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'shift-1' },
        data: expect.objectContaining({
          status: 'closed',
          closedByUserId: 'user-1',
          closingCashAmount: 62000,
          note: 'handoff',
        }),
      }),
    );
  });
});
