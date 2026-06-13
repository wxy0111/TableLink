import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string) {
    const table = await this.prisma.diningTable.findUnique({
      where: { code },
      include: { restaurant: true },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    return table;
  }

  async findAllForStaff() {
    return this.prisma.diningTable.findMany({
      orderBy: { name: 'asc' },
      include: {
        orders: {
          where: { paymentStatus: { not: 'paid' }, status: { not: 'cancelled' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }
}

