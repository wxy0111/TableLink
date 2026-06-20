import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { hashPin } from './pin-hash';

function createService() {
  const prisma = {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    prisma,
    service: new AuthService(prisma as unknown as PrismaService),
  };
}

const activeUser = {
  id: 'user-1',
  restaurantId: 'restaurant-1',
  name: 'Cashier',
  phone: '13800000002',
  role: 'cashier' as const,
  status: 'active',
};

describe('AuthService', () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it('verifies scrypt PIN hashes and rejects wrong PINs', () => {
    const { service } = context;
    const passwordHash = hashPin('3333');

    expect(service.verifyPin('3333', passwordHash)).toBe(true);
    expect(service.verifyPin('0000', passwordHash)).toBe(false);
    expect(passwordHash).toMatch(/^pin:scrypt:/);
  });

  it('keeps legacy pin:1234 compatibility and upgrades it after successful login', async () => {
    const { prisma, service } = context;
    prisma.user.findFirst.mockResolvedValue({ ...activeUser, passwordHash: 'pin:3333' });

    await service.login('13800000002', '3333', '192.168.1.20');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.stringMatching(/^pin:scrypt:/) },
    });
  });

  it('locks login after five failures for the same phone or IP', async () => {
    const { prisma, service } = context;
    prisma.user.findFirst.mockResolvedValue({ ...activeUser, passwordHash: hashPin('3333') });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.login('13800000002', '0000', '192.168.1.20')).rejects.toThrow(UnauthorizedException);
    }

    await expect(service.login('13800000002', '3333', '192.168.1.20')).rejects.toThrow(UnauthorizedException);
    await expect(service.login('13800000003', '3333', '192.168.1.20')).rejects.toThrow(UnauthorizedException);
  });

  it('clears failure counters after a successful login', async () => {
    const { prisma, service } = context;
    prisma.user.findFirst.mockResolvedValue({ ...activeUser, passwordHash: hashPin('3333') });

    await expect(service.login('13800000002', '0000', '10.0.0.8')).rejects.toThrow(UnauthorizedException);
    await service.login('13800000002', '3333', '10.0.0.8');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(service.login('13800000002', '0000', '10.0.0.8')).rejects.toThrow(UnauthorizedException);
    }

    await expect(service.login('13800000002', '3333', '10.0.0.8')).resolves.toEqual(expect.objectContaining({ user: expect.objectContaining({ id: 'user-1' }) }));
  });

  it('does not allow inactive users to login', async () => {
    const { prisma, service } = context;
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.login('13800000006', '3333')).rejects.toThrow('Phone or PIN is incorrect');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { phone: '13800000006', status: 'active' },
    });
  });
});
