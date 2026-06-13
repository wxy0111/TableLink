import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BackupPayload = {
  version: 1;
  exportedAt: string;
  data: {
    restaurants: unknown[];
    tables: unknown[];
    categories: unknown[];
    menuItems: unknown[];
    menuItemOptions: unknown[];
  };
};

@Injectable()
export class BackupsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportBackup(): Promise<BackupPayload> {
    const [restaurants, tables, categories, menuItems, menuItemOptions] = await Promise.all([
      this.prisma.restaurant.findMany(),
      this.prisma.diningTable.findMany(),
      this.prisma.category.findMany(),
      this.prisma.menuItem.findMany(),
      this.prisma.menuItemOption.findMany(),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        restaurants,
        tables,
        categories,
        menuItems,
        menuItemOptions,
      },
    };
  }

  async restoreBackup(payload: unknown) {
    if (!this.isBackupPayload(payload)) {
      throw new BadRequestException('Invalid backup payload');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const restaurant of payload.data.restaurants as any[]) {
        await tx.restaurant.upsert({
          where: { id: restaurant.id },
          update: {
            name: restaurant.name,
            status: restaurant.status,
          },
          create: restaurant,
        });
      }

      for (const table of payload.data.tables as any[]) {
        await tx.diningTable.upsert({
          where: { id: table.id },
          update: {
            name: table.name,
            code: table.code,
            capacity: table.capacity,
            status: table.status,
          },
          create: table,
        });
      }

      for (const category of payload.data.categories as any[]) {
        await tx.category.upsert({
          where: { id: category.id },
          update: {
            name: category.name,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
          },
          create: category,
        });
      }

      for (const menuItem of payload.data.menuItems as any[]) {
        await tx.menuItem.upsert({
          where: { id: menuItem.id },
          update: {
            categoryId: menuItem.categoryId,
            name: menuItem.name,
            description: menuItem.description,
            imageUrl: menuItem.imageUrl,
            price: menuItem.price,
            kitchenStation: menuItem.kitchenStation,
            status: menuItem.status,
            sortOrder: menuItem.sortOrder,
          },
          create: menuItem,
        });
      }

      for (const option of payload.data.menuItemOptions as any[]) {
        await tx.menuItemOption.upsert({
          where: { id: option.id },
          update: {
            name: option.name,
            type: option.type,
            required: option.required,
            values: option.values,
            sortOrder: option.sortOrder,
          },
          create: option,
        });
      }
    });

    return {
      restored: true,
      counts: {
        restaurants: payload.data.restaurants.length,
        tables: payload.data.tables.length,
        categories: payload.data.categories.length,
        menuItems: payload.data.menuItems.length,
        menuItemOptions: payload.data.menuItemOptions.length,
      },
    };
  }

  private isBackupPayload(payload: unknown): payload is BackupPayload {
    if (!payload || typeof payload !== 'object') return false;
    const candidate = payload as BackupPayload;
    return candidate.version === 1 && Boolean(candidate.data) && Array.isArray(candidate.data.restaurants);
  }
}
