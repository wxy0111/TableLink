import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthUser } from '../auth/auth.service';
import { verifyPinHash } from '../auth/pin-hash';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AdminService } from './admin.service';

const owner: AuthUser = {
  id: 'owner-1',
  restaurantId: 'restaurant-1',
  name: 'Owner',
  phone: '13800000001',
  role: 'owner',
};

const manager: AuthUser = {
  id: 'manager-1',
  restaurantId: 'restaurant-1',
  name: 'Manager',
  phone: '13800000002',
  role: 'manager',
};

describe('AdminService', () => {
  it('regenerates a table code and returns QR data for the new code', async () => {
    const prisma = {
      diningTable: {
        update: vi.fn().mockResolvedValue({
          id: 'table-1',
          restaurantId: 'restaurant-1',
          name: 'A01',
          code: 'TABLE-NEW',
          capacity: 4,
        }),
      },
    };
    const realtime = { publish: vi.fn() };
    const service = new AdminService(prisma as unknown as PrismaService, realtime as unknown as RealtimeService);

    const table = await service.regenerateTableCode('table-1');

    expect(prisma.diningTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { code: expect.stringMatching(/^TABLE-[A-Z0-9]+$/) },
    });
    expect(table.code).toBe('TABLE-NEW');
    expect(table.tableUrl).toContain('/table/TABLE-NEW');
    expect(table.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('updates a menu item between active and sold_out, writes audit log, and publishes menu.updated', async () => {
    const tx = {
      menuItem: {
        update: vi.fn().mockResolvedValue({ id: 'menu-1', status: 'sold_out', category: { id: 'category-1' } }),
      },
      auditLog: {
        create: vi.fn(),
      },
    };
    const prisma = {
      menuItem: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'menu-1',
          restaurantId: 'restaurant-1',
          name: 'Noodles',
          status: 'active',
        }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const realtime = { publish: vi.fn() };
    const service = new AdminService(prisma as unknown as PrismaService, realtime as unknown as RealtimeService);

    const updated = await service.updateMenuItemStatus('menu-1', 'sold_out');

    expect(updated.status).toBe('sold_out');
    expect(tx.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'menu-1' },
      data: { status: 'sold_out' },
      include: { category: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'menu_item.status_updated',
          metadata: expect.objectContaining({
            menuItemId: 'menu-1',
            previousStatus: 'active',
            nextStatus: 'sold_out',
          }),
        }),
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'menu.updated' });
  });

  it('lets an owner create an employee with hashed PIN and audit log', async () => {
    const tx = {
      user: {
        create: vi.fn(({ data }) => Promise.resolve({ id: 'user-1', ...data })),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    const user = await service.createUser(owner, { name: '张三', phone: '13800000006', role: 'waiter', pin: '1234' });

    expect(user.passwordHash).not.toBe('pin:1234');
    expect(verifyPinHash('1234', user.passwordHash)).toBe(true);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.created' }) }));
    expect(JSON.stringify(tx.auditLog.create.mock.calls[0][0])).not.toContain('1234');
  });

  it('resets PIN so the old PIN fails and the new PIN works', async () => {
    const tx = {
      user: {
        update: vi.fn(({ data }) => Promise.resolve({ id: 'user-1', passwordHash: data.passwordHash })),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1', restaurantId: 'restaurant-1', role: 'waiter', status: 'active', name: '张三' }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    const user = await service.resetUserPin(owner, 'user-1', { pin: '5678' });

    expect(verifyPinHash('1234', user.passwordHash)).toBe(false);
    expect(verifyPinHash('5678', user.passwordHash)).toBe(true);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.pin_reset' }) }));
    expect(JSON.stringify(tx.auditLog.create.mock.calls[0][0])).not.toContain('5678');
  });

  it('prevents a manager from creating an owner', async () => {
    const prisma = { user: { findFirst: vi.fn() } };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    await expect(service.createUser(manager, { name: 'Owner 2', phone: '13800000007', role: 'owner', pin: '1234' })).rejects.toThrow(BadRequestException);
  });

  it('prevents duplicate phone numbers', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-user' }),
      },
    };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    await expect(service.createUser(owner, { name: '张三', phone: '13800000006', role: 'waiter', pin: '1234' })).rejects.toThrow(BadRequestException);
  });

  it('prevents deactivating the last active owner', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'owner-1', restaurantId: 'restaurant-1', role: 'owner', status: 'active', name: 'Owner' }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    await expect(service.deactivateUser(owner, 'owner-1')).rejects.toThrow(BadRequestException);
  });

  it('prevents changing the last active owner to a non-owner role', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'owner-1', restaurantId: 'restaurant-1', role: 'owner', status: 'active', name: 'Owner' }),
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    await expect(service.updateUser(owner, 'owner-1', { role: 'manager' })).rejects.toThrow(BadRequestException);
  });

  it('writes audit logs for update, deactivate, and activate', async () => {
    const tx = {
      user: {
        update: vi.fn(({ data }) => Promise.resolve({ id: 'user-1', ...data })),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1', restaurantId: 'restaurant-1', role: 'waiter', status: 'active', name: '张三', phone: '13800000006' }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    await service.updateUser(owner, 'user-1', { role: 'cashier' });
    await service.deactivateUser(owner, 'user-1');
    await service.activateUser(owner, 'user-1');

    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.updated' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.deactivated' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.activated' }) }));
  });

  it('creates a menu item option, writes audit log, and publishes menu.updated', async () => {
    const tx = {
      menuItemOption: {
        create: vi.fn(({ data }) => Promise.resolve({ id: 'option-1', ...data })),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      menuItem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'menu-1', restaurantId: 'restaurant-1', name: 'Noodles' }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const realtime = { publish: vi.fn() };
    const service = new AdminService(prisma as unknown as PrismaService, realtime as unknown as RealtimeService);

    const option = await service.createMenuItemOption(owner, 'menu-1', {
      name: '辣度',
      type: 'single',
      required: true,
      values: [
        { name: '不辣', priceDelta: 0 },
        { name: '特辣', priceDelta: 100 },
      ],
      sortOrder: 1,
    });

    expect(option).toEqual(expect.objectContaining({ id: 'option-1', name: '辣度', required: true }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'menu_item_option.created' }) }));
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'menu.updated' });
  });

  it('updates and deletes menu item options with audit logs', async () => {
    const tx = {
      menuItemOption: {
        update: vi.fn(({ data }) => Promise.resolve({ id: 'option-1', name: data.name, values: data.values })),
        delete: vi.fn().mockResolvedValue({ id: 'option-1' }),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      menuItemOption: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'option-1',
          menuItemId: 'menu-1',
          name: '辣度',
          menuItem: { id: 'menu-1', restaurantId: 'restaurant-1' },
        }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const realtime = { publish: vi.fn() };
    const service = new AdminService(prisma as unknown as PrismaService, realtime as unknown as RealtimeService);

    await service.updateMenuItemOption(owner, 'option-1', {
      name: '口味',
      values: [{ name: '微辣', priceDelta: 0 }],
    });
    await service.deleteMenuItemOption(owner, 'option-1');

    expect(tx.menuItemOption.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'option-1' } }));
    expect(tx.menuItemOption.delete).toHaveBeenCalledWith({ where: { id: 'option-1' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'menu_item_option.updated' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'menu_item_option.deleted' }) }));
    expect(realtime.publish).toHaveBeenCalledWith({ type: 'menu.updated' });
  });

  it('rejects invalid option values', async () => {
    const prisma = {
      menuItem: {
        findFirst: vi.fn().mockResolvedValue({ id: 'menu-1', restaurantId: 'restaurant-1', name: 'Noodles' }),
      },
    };
    const service = new AdminService(prisma as unknown as PrismaService, { publish: vi.fn() } as unknown as RealtimeService);

    await expect(
      service.createMenuItemOption(owner, 'menu-1', {
        name: '加料',
        type: 'multiple',
        required: false,
        values: [{ name: '加肉', priceDelta: -1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
