import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetupRestaurantDto } from './dto/setup.dto';

const RESTAURANT_ID = 'seed-restaurant-xidao';

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: RESTAURANT_ID },
      include: {
        tables: true,
        categories: true,
        menuItems: true,
      },
    });

    return {
      initialized: Boolean(restaurant),
      restaurant,
      counts: {
        tables: restaurant?.tables.length ?? 0,
        categories: restaurant?.categories.length ?? 0,
        menuItems: restaurant?.menuItems.length ?? 0,
      },
    };
  }

  async setupRestaurant(dto: SetupRestaurantDto) {
    const tableCount = dto.tableCount ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.upsert({
        where: { id: RESTAURANT_ID },
        update: { name: dto.restaurantName },
        create: {
          id: RESTAURANT_ID,
          name: dto.restaurantName,
        },
      });

      if (tableCount > 0) {
        const existingTables = await tx.diningTable.count({ where: { restaurantId: restaurant.id } });
        if (existingTables === 0) {
          await tx.diningTable.createMany({
            data: Array.from({ length: tableCount }, (_unused, index) => ({
              restaurantId: restaurant.id,
              name: `A${String(index + 1).padStart(2, '0')}`,
              code: `TABLE-${String(index + 1).padStart(2, '0')}`,
              capacity: 4,
            })),
          });
        }
      }

      return tx.restaurant.findUnique({
        where: { id: restaurant.id },
        include: {
          tables: true,
          categories: true,
          menuItems: true,
        },
      });
    });
  }
}

