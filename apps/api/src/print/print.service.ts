import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class PrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  findMany(status?: PrintJobStatus) {
    return this.prisma.printJob.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { table: true, order: true, orderItem: true },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id },
      include: { table: true, order: true, orderItem: true },
    });
    if (!job) throw new NotFoundException('Print job not found');
    return job;
  }

  async markPrinted(id: string) {
    const job = await this.prisma.printJob.update({
      where: { id },
      data: { status: 'printed', printedAt: new Date(), lastError: null },
      include: { table: true, order: true, orderItem: true },
    });
    this.realtime.publish({ type: 'print.updated' });
    return job;
  }

  async markFailed(id: string, dto: { error?: string }) {
    const job = await this.prisma.printJob.update({
      where: { id },
      data: { status: 'failed', lastError: dto.error ?? 'Print failed' },
      include: { table: true, order: true, orderItem: true },
    });
    this.realtime.publish({ type: 'print.updated' });
    return job;
  }

  async retry(id: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Print job not found');
    if (job.status !== 'failed') throw new BadRequestException('Only failed print jobs can be retried');

    const updated = await this.prisma.printJob.update({
      where: { id },
      data: { status: 'pending', attempts: { increment: 1 }, lastError: null },
      include: { table: true, order: true, orderItem: true },
    });
    this.realtime.publish({ type: 'print.updated' });
    return updated;
  }
}
