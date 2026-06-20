import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SystemService } from './system.service';

function createService() {
  const prisma = {
    restaurant: {
      count: vi.fn().mockResolvedValue(1),
    },
  };
  const service = new SystemService(prisma as unknown as PrismaService);
  return { prisma, service };
}

describe('SystemService', () => {
  it('returns ok health when database and storage checks pass', async () => {
    const { service } = createService();
    vi.spyOn(service, 'checkStorage').mockResolvedValue('ok');

    const health = await service.getHealth();

    expect(health).toEqual(
      expect.objectContaining({
        api: 'ok',
        database: 'ok',
        realtime: 'ok',
        storage: 'ok',
        checkedAt: expect.any(String),
      }),
    );
    expect(health.environment).toEqual(
      expect.objectContaining({
        nodeEnv: expect.any(String),
        apiPort: expect.any(Number),
        webPort: expect.any(Number),
        hasDatabaseUrl: expect.any(Boolean),
      }),
    );
    expect(JSON.stringify(health)).not.toContain('DATABASE_URL');
  });

  it('marks database as error when the database probe fails', async () => {
    const { prisma, service } = createService();
    prisma.restaurant.count.mockRejectedValue(new Error('database down'));
    vi.spyOn(service, 'checkStorage').mockResolvedValue('ok');

    const health = await service.getHealth();

    expect(health.database).toBe('error');
    expect(health.api).toBe('degraded');
    expect(health.errors).toContain('database: database down');
  });

  it('marks storage as error when upload storage is not writable', async () => {
    const { service } = createService();
    vi.spyOn(service, 'checkStorage').mockResolvedValue('error');

    const health = await service.getHealth();

    expect(health.storage).toBe('error');
    expect(health.api).toBe('degraded');
    expect(health.errors).toContain('storage: uploads directory is not writable');
  });
});
