import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublicMenu(restaurantId: string) {
    return this.prisma.category.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        menuItems: {
          where: { status: { in: ['active', 'sold_out'] } },
          orderBy: { sortOrder: 'asc' },
          include: {
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
  }
}

