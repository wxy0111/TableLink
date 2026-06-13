import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCategoryDto } from './dto/category.dto';
import { UpsertMenuItemDto } from './dto/menu-item.dto';
import { CreateTableDto } from './dto/table.dto';

const RESTAURANT_ID = 'seed-restaurant-xidao';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  findCategories() {
    return this.prisma.category.findMany({
      where: { restaurantId: RESTAURANT_ID },
      orderBy: { sortOrder: 'asc' },
    });
  }

  createCategory(dto: UpsertCategoryDto) {
    return this.prisma.category.create({
      data: {
        restaurantId: RESTAURANT_ID,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  updateCategory(categoryId: string, dto: Partial<UpsertCategoryDto>) {
    return this.prisma.category.update({
      where: { id: categoryId },
      data: dto,
    });
  }

  findMenuItems() {
    return this.prisma.menuItem.findMany({
      where: { restaurantId: RESTAURANT_ID },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: true },
    });
  }

  createMenuItem(dto: UpsertMenuItemDto) {
    return this.prisma.menuItem.create({
      data: {
        restaurantId: RESTAURANT_ID,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        kitchenStation: dto.kitchenStation,
        status: dto.status ?? 'active',
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  updateMenuItem(menuItemId: string, dto: Partial<UpsertMenuItemDto>) {
    const data: Prisma.MenuItemUpdateInput = {
      name: dto.name,
      description: dto.description,
      price: dto.price,
      kitchenStation: dto.kitchenStation,
      status: dto.status,
      imageUrl: dto.imageUrl,
      sortOrder: dto.sortOrder,
    };

    if (dto.categoryId) {
      data.category = { connect: { id: dto.categoryId } };
    }

    return this.prisma.menuItem.update({
      where: { id: menuItemId },
      data,
    });
  }

  createImageResponse(file: any) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    return {
      imageUrl: `/uploads/menu/${file.filename}`,
      filename: file.filename,
    };
  }

  async findTables() {
    const tables = await this.prisma.diningTable.findMany({
      where: { restaurantId: RESTAURANT_ID },
      orderBy: { name: 'asc' },
    });

    return Promise.all(tables.map((table) => this.withQr(table)));
  }

  async createTable(dto: CreateTableDto) {
    const table = await this.prisma.diningTable.create({
      data: {
        restaurantId: RESTAURANT_ID,
        name: dto.name,
        code: dto.code ?? `TABLE-${Date.now().toString(36).toUpperCase()}`,
        capacity: dto.capacity ?? 4,
      },
    });

    return this.withQr(table);
  }

  private async withQr(table: { code: string }) {
    const tableUrl = this.getTableUrl(table.code);
    return {
      ...table,
      tableUrl,
      qrDataUrl: await QRCode.toDataURL(tableUrl, { margin: 1, width: 220 }),
    };
  }

  private getTableUrl(tableCode: string) {
    const publicBaseUrl = process.env.PUBLIC_WEB_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? 3000}`;
    return `${publicBaseUrl}/table/${tableCode}`;
  }
}
