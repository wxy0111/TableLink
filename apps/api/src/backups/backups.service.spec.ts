import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { BackupsService } from './backups.service';

const collectionNames = [
  'restaurants',
  'tables',
  'users',
  'categories',
  'menuItems',
  'menuItemOptions',
  'orders',
  'orderItems',
  'orderEvents',
  'payments',
  'serviceCalls',
  'auditLogs',
  'printJobs',
  'ledgerEntries',
  'shifts',
] as const;

function createDelegate(rows: unknown[] = []) {
  return {
    findMany: vi.fn().mockResolvedValue(rows),
    upsert: vi.fn().mockResolvedValue({}),
  };
}

function createService() {
  const tx = {
    restaurant: createDelegate(),
    diningTable: createDelegate(),
    user: createDelegate(),
    category: createDelegate(),
    menuItem: createDelegate(),
    menuItemOption: createDelegate(),
    order: createDelegate(),
    orderItem: createDelegate(),
    payment: createDelegate(),
    serviceCall: createDelegate(),
    orderEvent: createDelegate(),
    auditLog: {
      ...createDelegate(),
      create: vi.fn().mockResolvedValue({}),
    },
    printJob: createDelegate(),
    ledgerEntry: createDelegate(),
    shift: createDelegate(),
  };
  const prisma = {
    restaurant: createDelegate([{ id: 'restaurant-1', name: 'Xidao', businessDayStartMinute: 300 }]),
    diningTable: createDelegate([{ id: 'table-1', restaurantId: 'restaurant-1' }]),
    user: createDelegate([{ id: 'user-1', restaurantId: 'restaurant-1' }]),
    category: createDelegate([{ id: 'category-1', restaurantId: 'restaurant-1' }]),
    menuItem: createDelegate([{ id: 'menu-1', restaurantId: 'restaurant-1', categoryId: 'category-1' }]),
    menuItemOption: createDelegate([{ id: 'option-1', menuItemId: 'menu-1' }]),
    order: createDelegate([{ id: 'order-1', restaurantId: 'restaurant-1', tableId: 'table-1', customerAccessTokenHash: 'hash' }]),
    orderItem: createDelegate([{ id: 'order-item-1', orderId: 'order-1', menuItemId: 'menu-1' }]),
    orderEvent: createDelegate([{ id: 'event-1', orderId: 'order-1' }]),
    payment: createDelegate([{ id: 'payment-1', orderId: 'order-1' }]),
    serviceCall: createDelegate([{ id: 'service-call-1', restaurantId: 'restaurant-1', tableId: 'table-1' }]),
    auditLog: createDelegate([{ id: 'audit-1', restaurantId: 'restaurant-1' }]),
    printJob: createDelegate([{ id: 'print-1', restaurantId: 'restaurant-1' }]),
    ledgerEntry: createDelegate([{ id: 'ledger-1', restaurantId: 'restaurant-1', sourceId: 'payment-1' }]),
    shift: createDelegate([{ id: 'shift-1', restaurantId: 'restaurant-1' }]),
    $transaction: vi.fn((callback) => callback(tx)),
  };

  return {
    prisma,
    tx,
    service: new BackupsService(prisma as unknown as PrismaService),
  };
}

function createBackup(overrides: Record<string, unknown[]> = {}) {
  const data = Object.fromEntries(collectionNames.map((name) => [name, [{ id: `${name}-1` }]]));
  return {
    version: 2,
    exportedAt: '2026-06-18T01:30:00.000Z',
    metadata: {
      exportedAt: '2026-06-18T01:30:00.000Z',
      restaurantName: 'Xidao',
      counts: Object.fromEntries(collectionNames.map((name) => [name, 1])),
    },
    data: { ...data, ...overrides },
  };
}

describe('BackupsService', () => {
  let context: ReturnType<typeof createService>;

  beforeEach(() => {
    context = createService();
  });

  it('exports version 2 with complete operating data and counts', async () => {
    const { service } = context;

    const backup = await service.exportBackup();

    expect(backup.version).toBe(2);
    for (const name of collectionNames) {
      expect(Array.isArray(backup.data[name])).toBe(true);
      expect(backup.metadata.counts[name]).toBe(1);
    }
    expect(backup.data.restaurants[0]).toEqual(expect.objectContaining({ businessDayStartMinute: 300 }));
    expect(backup.data.orders[0]).toEqual(expect.objectContaining({ customerAccessTokenHash: 'hash' }));
    expect(backup.data.shifts[0]).toEqual(expect.objectContaining({ id: 'shift-1' }));
  });

  it('requires explicit restore confirmation', async () => {
    const { service } = context;

    await expect(service.restoreBackup({ backup: createBackup() })).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported versions', async () => {
    const { service } = context;

    await expect(service.restoreBackup({ confirmRestore: true, backup: { version: 99, data: {} } })).rejects.toThrow('Unsupported backup version');
  });

  it('rejects missing data, non-array collections, and duplicate ids', async () => {
    const { service } = context;

    await expect(service.restoreBackup({ confirmRestore: true, backup: { version: 2 } })).rejects.toThrow('Backup data is required');
    await expect(service.restoreBackup({ confirmRestore: true, backup: createBackup({ orders: {} as unknown as unknown[] }) })).rejects.toThrow('Backup collection orders must be an array');
    await expect(service.restoreBackup({ confirmRestore: true, backup: createBackup({ orders: [{ id: 'same' }, { id: 'same' }] }) })).rejects.toThrow('Backup collection orders contains duplicate id: same');
  });

  it('restores version 2 in foreign-key order and writes an audit log', async () => {
    const { service, tx } = context;
    const calls: string[] = [];
    for (const [name, delegate] of Object.entries(tx)) {
      if ('upsert' in delegate) {
        delegate.upsert.mockImplementation(async () => {
          calls.push(name);
          return {};
        });
      }
    }

    const result = await service.restoreBackup({ confirmRestore: true, backup: createBackup() });

    expect(result.restored).toBe(true);
    expect(calls).toEqual([
      'restaurant',
      'diningTable',
      'user',
      'category',
      'menuItem',
      'menuItemOption',
      'order',
      'orderItem',
      'payment',
      'serviceCall',
      'orderEvent',
      'auditLog',
      'printJob',
      'ledgerEntry',
      'shift',
    ]);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'backup.restored' }) }));
  });

  it('accepts version 1 backups as basic-data restores', async () => {
    const { service } = context;
    const backup = {
      version: 1,
      data: {
        restaurants: [{ id: 'restaurant-1' }],
        tables: [],
        categories: [],
        menuItems: [],
        menuItemOptions: [],
      },
    };

    const result = await service.restoreBackup({ confirmRestore: true, backup });

    expect(result.restored).toBe(true);
    expect(result.warning).toContain('Version 1');
  });
});
