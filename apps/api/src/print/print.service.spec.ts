import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PrintService } from './print.service';

function createService() {
  const prisma = {
    printJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const realtime = { publish: vi.fn() };
  return {
    prisma,
    realtime,
    service: new PrintService(prisma as unknown as PrismaService, realtime as unknown as RealtimeService),
  };
}

describe('PrintService', () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it('filters print jobs by status', async () => {
    const { prisma, service } = context;
    prisma.printJob.findMany.mockResolvedValue([{ id: 'print-1', status: 'pending' }]);

    const jobs = await service.findMany('pending');

    expect(jobs).toEqual([{ id: 'print-1', status: 'pending' }]);
    expect(prisma.printJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'pending' } }));
  });

  it('marks a print job as printed', async () => {
    const { prisma, realtime, service } = context;
    prisma.printJob.update.mockResolvedValue({ id: 'print-1', status: 'printed' });

    const job = await service.markPrinted('print-1');

    expect(job.status).toBe('printed');
    expect(prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'printed', printedAt: expect.any(Date) }) }));
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'print.updated' });
  });

  it('marks a print job as failed with lastError', async () => {
    const { prisma, realtime, service } = context;
    prisma.printJob.update.mockResolvedValue({ id: 'print-1', status: 'failed', lastError: 'paper out' });

    const job = await service.markFailed('print-1', { error: 'paper out' });

    expect(job.lastError).toBe('paper out');
    expect(prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'failed', lastError: 'paper out' } }));
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'print.updated' });
  });

  it('retries failed jobs and increments attempts', async () => {
    const { prisma, realtime, service } = context;
    prisma.printJob.findUnique.mockResolvedValue({ id: 'print-1', status: 'failed' });
    prisma.printJob.update.mockResolvedValue({ id: 'print-1', status: 'pending', attempts: 2 });

    const job = await service.retry('print-1');

    expect(job.status).toBe('pending');
    expect(prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'pending', attempts: { increment: 1 }, lastError: null } }));
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'print.updated' });
  });

  it('rejects retry for non-failed jobs', async () => {
    const { prisma, service } = context;
    prisma.printJob.findUnique.mockResolvedValue({ id: 'print-1', status: 'pending' });

    await expect(service.retry('print-1')).rejects.toThrow(BadRequestException);
  });
});
