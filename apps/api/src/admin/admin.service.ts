import { BadRequestException, Injectable } from '@nestjs/common';
import { MenuItemStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { AuthUser } from '../auth/auth.service';
import { hashPin } from '../auth/pin-hash';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { normalizeMenuOptionValues } from '../menu/menu-option-values';
import { UpsertCategoryDto } from './dto/category.dto';
import { UpsertMenuItemDto } from './dto/menu-item.dto';
import { UpdateMenuItemOptionDto, UpsertMenuItemOptionDto } from './dto/menu-item-option.dto';
import { CreateTableDto } from './dto/table.dto';
import { CreateUserDto, ResetUserPinDto, UpdateUserDto } from './dto/user.dto';

const RESTAURANT_ID = 'seed-restaurant-xidao';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

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
      include: { category: true, options: { orderBy: { sortOrder: 'asc' } } },
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

  async updateMenuItemStatus(menuItemId: string, status: MenuItemStatus) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: menuItemId },
      select: { id: true, restaurantId: true, name: true, status: true },
    });

    if (!menuItem) {
      throw new BadRequestException('Menu item not found');
    }

    const updatedMenuItem = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({
        where: { id: menuItemId },
        data: { status },
        include: { category: true },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: menuItem.restaurantId,
          action: 'menu_item.status_updated',
          operatorType: 'staff',
          summary: `Menu item ${menuItem.name} status changed from ${menuItem.status} to ${status}`,
          metadata: {
            menuItemId,
            previousStatus: menuItem.status,
            nextStatus: status,
          },
        },
      });

      return updated;
    });

    this.realtime.publish({ type: 'menu.updated' });
    return updatedMenuItem;
  }

  async findMenuItemOptions(actor: AuthUser, menuItemId: string) {
    await this.findMenuItemForManagement(actor, menuItemId);
    return this.prisma.menuItemOption.findMany({
      where: { menuItemId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createMenuItemOption(actor: AuthUser, menuItemId: string, dto: UpsertMenuItemOptionDto) {
    const menuItem = await this.findMenuItemForManagement(actor, menuItemId);
    const name = this.normalizeOptionName(dto.name);
    const values = normalizeMenuOptionValues(dto.values as unknown as Prisma.JsonValue);

    const option = await this.prisma.$transaction(async (tx) => {
      const created = await tx.menuItemOption.create({
        data: {
          menuItemId,
          name,
          type: dto.type,
          required: dto.required,
          values,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: actor.restaurantId,
          action: 'menu_item_option.created',
          operatorType: 'staff',
          operatorUserId: actor.id,
          summary: `Created option ${created.name} for ${menuItem.name}`,
          metadata: { menuItemId, optionId: created.id, optionName: created.name },
        },
      });

      return created;
    });

    this.realtime.publish({ type: 'menu.updated' });
    return option;
  }

  async updateMenuItemOption(actor: AuthUser, optionId: string, dto: UpdateMenuItemOptionDto) {
    const option = await this.findMenuItemOptionForManagement(actor, optionId);
    const name = dto.name === undefined ? undefined : this.normalizeOptionName(dto.name);
    const values = dto.values === undefined ? undefined : normalizeMenuOptionValues(dto.values as unknown as Prisma.JsonValue);

    const updatedOption = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.menuItemOption.update({
        where: { id: optionId },
        data: {
          name,
          type: dto.type,
          required: dto.required,
          values,
          sortOrder: dto.sortOrder,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: actor.restaurantId,
          action: 'menu_item_option.updated',
          operatorType: 'staff',
          operatorUserId: actor.id,
          summary: `Updated option ${option.name}`,
          metadata: {
            menuItemId: option.menuItemId,
            optionId,
            previousName: option.name,
            nextName: updated.name,
          },
        },
      });

      return updated;
    });

    this.realtime.publish({ type: 'menu.updated' });
    return updatedOption;
  }

  async deleteMenuItemOption(actor: AuthUser, optionId: string) {
    const option = await this.findMenuItemOptionForManagement(actor, optionId);

    const deletedOption = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.menuItemOption.delete({ where: { id: optionId } });

      await tx.auditLog.create({
        data: {
          restaurantId: actor.restaurantId,
          action: 'menu_item_option.deleted',
          operatorType: 'staff',
          operatorUserId: actor.id,
          summary: `Deleted option ${option.name}`,
          metadata: { menuItemId: option.menuItemId, optionId, optionName: option.name },
        },
      });

      return deleted;
    });

    this.realtime.publish({ type: 'menu.updated' });
    return deletedOption;
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

  async regenerateTableCode(tableId: string) {
    const table = await this.prisma.diningTable.update({
      where: { id: tableId },
      data: { code: this.createTableCode() },
    });

    return this.withQr(table);
  }

  findUsers(actor: AuthUser) {
    return this.prisma.user.findMany({
      where: { restaurantId: actor.restaurantId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        restaurantId: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createUser(actor: AuthUser, dto: CreateUserDto) {
    this.assertManagerCanUseRole(actor, dto.role);
    this.assertPin(dto.pin);
    await this.assertPhoneAvailable(actor.restaurantId, dto.phone);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          restaurantId: actor.restaurantId,
          name: dto.name,
          phone: dto.phone,
          role: dto.role,
          status: 'active',
          passwordHash: hashPin(dto.pin),
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: actor.restaurantId,
          action: 'user.created',
          operatorType: 'staff',
          operatorUserId: actor.id,
          summary: `Created user ${user.name}`,
          metadata: { targetUserId: user.id, role: user.role, status: user.status },
        },
      });

      return user;
    });
  }

  async updateUser(actor: AuthUser, userId: string, dto: UpdateUserDto) {
    return this.updateUserWithAction(actor, userId, dto, 'user.updated');
  }

  private async updateUserWithAction(actor: AuthUser, userId: string, dto: UpdateUserDto, action: 'user.updated' | 'user.deactivated' | 'user.activated') {
    const target = await this.findUserForManagement(actor, userId);
    this.assertManagerCanManageTarget(actor, target);
    if (dto.role) {
      this.assertManagerCanUseRole(actor, dto.role);
    }
    if (dto.phone && dto.phone !== target.phone) {
      await this.assertPhoneAvailable(actor.restaurantId, dto.phone, userId);
    }
    await this.assertOwnerProtection(target, dto);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          phone: dto.phone,
          role: dto.role,
          status: dto.status,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: actor.restaurantId,
          action,
          operatorType: 'staff',
          operatorUserId: actor.id,
          summary: `Updated user ${target.name}`,
          metadata: {
            targetUserId: userId,
            previousRole: target.role,
            nextRole: dto.role ?? target.role,
            previousStatus: target.status,
            nextStatus: dto.status ?? target.status,
          },
        },
      });

      return updated;
    });
  }

  async resetUserPin(actor: AuthUser, userId: string, dto: ResetUserPinDto) {
    const target = await this.findUserForManagement(actor, userId);
    this.assertManagerCanManageTarget(actor, target);
    this.assertPin(dto.pin);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hashPin(dto.pin) },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: actor.restaurantId,
          action: 'user.pin_reset',
          operatorType: 'staff',
          operatorUserId: actor.id,
          summary: `Reset PIN for ${target.name}`,
          metadata: { targetUserId: userId },
        },
      });

      return updated;
    });
  }

  async deactivateUser(actor: AuthUser, userId: string) {
    return this.updateUserWithAction(actor, userId, { status: 'inactive' }, 'user.deactivated');
  }

  async activateUser(actor: AuthUser, userId: string) {
    return this.updateUserWithAction(actor, userId, { status: 'active' }, 'user.activated');
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

  private createTableCode() {
    return `TABLE-${randomBytes(8).toString('base64url').replaceAll('-', '').replaceAll('_', '').toUpperCase()}`;
  }

  private async findUserForManagement(actor: AuthUser, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.restaurantId !== actor.restaurantId) {
      throw new BadRequestException('User not found');
    }
    return user;
  }

  private async findMenuItemForManagement(actor: AuthUser, menuItemId: string) {
    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, restaurantId: actor.restaurantId },
    });

    if (!menuItem) {
      throw new BadRequestException('Menu item not found');
    }

    return menuItem;
  }

  private async findMenuItemOptionForManagement(actor: AuthUser, optionId: string) {
    const option = await this.prisma.menuItemOption.findUnique({
      where: { id: optionId },
      include: { menuItem: true },
    });

    if (!option || option.menuItem.restaurantId !== actor.restaurantId) {
      throw new BadRequestException('Menu item option not found');
    }

    return option;
  }

  private assertManagerCanUseRole(actor: AuthUser, role: Role) {
    if (actor.role === 'manager' && role === 'owner') {
      throw new BadRequestException('Managers cannot create or assign owner role');
    }
  }

  private assertManagerCanManageTarget(actor: AuthUser, target: { role: Role }) {
    if (actor.role === 'manager' && target.role === 'owner') {
      throw new BadRequestException('Managers cannot modify owner accounts');
    }
  }

  private async assertOwnerProtection(target: { id: string; restaurantId: string; role: Role; status: UserStatus }, dto: UpdateUserDto) {
    const demotesOwner = target.role === 'owner' && dto.role !== undefined && dto.role !== 'owner';
    const deactivatesOwner = target.role === 'owner' && target.status === 'active' && dto.status === 'inactive';

    if (!demotesOwner && !deactivatesOwner) return;

    const otherActiveOwners = await this.prisma.user.count({
      where: {
        restaurantId: target.restaurantId,
        role: 'owner',
        status: 'active',
        id: { not: target.id },
      },
    });

    if (otherActiveOwners === 0) {
      throw new BadRequestException('At least one active owner is required');
    }
  }

  private async assertPhoneAvailable(restaurantId: string, phone: string, excludingUserId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        phone,
        ...(excludingUserId ? { id: { not: excludingUserId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Phone already exists');
    }
  }

  private assertPin(pin: string) {
    if (!/^\d{4,8}$/.test(pin)) {
      throw new BadRequestException('PIN must be 4-8 digits');
    }
  }

  private normalizeOptionName(name: string) {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('Option name is required');
    }
    return normalized;
  }
}
