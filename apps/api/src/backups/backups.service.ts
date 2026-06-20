import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BACKUP_VERSION = 2;

const collectionNames = [
  'restaurants',
  'tables',
  'users',
  'categories',
  'menuItems',
  'menuItemOptions',
  'orders',
  'orderItems',
  'payments',
  'serviceCalls',
  'orderEvents',
  'auditLogs',
  'printJobs',
  'ledgerEntries',
  'shifts',
] as const;

type CollectionName = (typeof collectionNames)[number];
type BackupData = Record<CollectionName, Record<string, unknown>[]>;

type BackupPayloadV2 = {
  version: 2;
  exportedAt: string;
  metadata: {
    exportedAt: string;
    restaurantName: string | null;
    appVersion?: string;
    counts: Record<CollectionName, number>;
  };
  data: BackupData;
};

type RestoreRequest = {
  confirmRestore?: boolean;
  backup?: unknown;
};

@Injectable()
export class BackupsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportBackup(): Promise<BackupPayloadV2> {
    const [
      restaurants,
      tables,
      users,
      categories,
      menuItems,
      menuItemOptions,
      orders,
      orderItems,
      payments,
      serviceCalls,
      orderEvents,
      auditLogs,
      printJobs,
      ledgerEntries,
      shifts,
    ] = await Promise.all([
      this.prisma.restaurant.findMany(),
      this.prisma.diningTable.findMany(),
      this.prisma.user.findMany(),
      this.prisma.category.findMany(),
      this.prisma.menuItem.findMany(),
      this.prisma.menuItemOption.findMany(),
      this.prisma.order.findMany(),
      this.prisma.orderItem.findMany(),
      this.prisma.payment.findMany(),
      this.prisma.serviceCall.findMany(),
      this.prisma.orderEvent.findMany(),
      this.prisma.auditLog.findMany(),
      this.prisma.printJob.findMany(),
      this.prisma.ledgerEntry.findMany(),
      this.prisma.shift.findMany(),
    ]);

    const data = {
      restaurants,
      tables,
      users,
      categories,
      menuItems,
      menuItemOptions,
      orders,
      orderItems,
      payments,
      serviceCalls,
      orderEvents,
      auditLogs,
      printJobs,
      ledgerEntries,
      shifts,
    } satisfies BackupData;
    const exportedAt = new Date().toISOString();
    const counts = Object.fromEntries(collectionNames.map((name) => [name, data[name].length])) as Record<CollectionName, number>;

    return {
      version: BACKUP_VERSION,
      exportedAt,
      metadata: {
        exportedAt,
        restaurantName: restaurants[0]?.name ?? null,
        appVersion: 'tablelink-local',
        counts,
      },
      data,
    };
  }

  async restoreBackup(request: unknown) {
    if (!this.isRestoreRequest(request) || request.confirmRestore !== true) {
      throw new BadRequestException('Restore confirmation is required');
    }

    const backup = request.backup;
    const normalized = this.normalizeBackup(backup);

    await this.prisma.$transaction(async (tx) => {
      for (const restaurant of normalized.data.restaurants) {
        await this.upsertRow(tx.restaurant, restaurant);
      }

      for (const table of normalized.data.tables) {
        await this.upsertRow(tx.diningTable, table);
      }

      for (const user of normalized.data.users) {
        await this.upsertRow(tx.user, user);
      }

      for (const category of normalized.data.categories) {
        await this.upsertRow(tx.category, category);
      }

      for (const menuItem of normalized.data.menuItems) {
        await this.upsertRow(tx.menuItem, menuItem);
      }

      for (const option of normalized.data.menuItemOptions) {
        await this.upsertRow(tx.menuItemOption, option);
      }

      for (const order of normalized.data.orders) {
        await this.upsertRow(tx.order, order);
      }

      for (const item of normalized.data.orderItems) {
        await this.upsertRow(tx.orderItem, item);
      }

      for (const payment of normalized.data.payments) {
        await this.upsertRow(tx.payment, payment);
      }

      for (const call of normalized.data.serviceCalls) {
        await this.upsertRow(tx.serviceCall, call);
      }

      for (const event of normalized.data.orderEvents) {
        await this.upsertRow(tx.orderEvent, event);
      }

      for (const log of normalized.data.auditLogs) {
        await this.upsertRow(tx.auditLog, log);
      }

      for (const job of normalized.data.printJobs) {
        await this.upsertRow(tx.printJob, job);
      }

      for (const entry of normalized.data.ledgerEntries) {
        await this.upsertRow(tx.ledgerEntry, entry);
      }

      for (const shift of normalized.data.shifts) {
        await this.upsertRow(tx.shift, shift);
      }

      const firstRestaurant = normalized.data.restaurants[0];
      if (firstRestaurant) {
        await tx.auditLog.create({
          data: {
            restaurantId: this.rowId(firstRestaurant),
            action: 'backup.restored',
            operatorType: 'system',
            summary: `Restored backup version ${normalized.version}`,
            metadata: {
              version: normalized.version,
              counts: normalized.counts,
              warning: normalized.warning ?? null,
            },
          },
        });
      }
    });

    return {
      restored: true,
      version: normalized.version,
      warning: normalized.warning,
      counts: normalized.counts,
    };
  }

  private normalizeBackup(payload: unknown): { version: number; data: BackupData; counts: Record<CollectionName, number>; warning?: string } {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid backup payload');
    }

    const candidate = payload as { version?: unknown; data?: unknown };
    if (candidate.version !== 1 && candidate.version !== BACKUP_VERSION) {
      throw new BadRequestException(`Unsupported backup version: ${String(candidate.version)}`);
    }
    if (!candidate.data || typeof candidate.data !== 'object') {
      throw new BadRequestException('Backup data is required');
    }

    const sourceData = candidate.data as Record<string, unknown>;
    const data = Object.fromEntries(collectionNames.map((name) => [name, []])) as unknown as BackupData;
    const namesToValidate = candidate.version === 1 ? ['restaurants', 'tables', 'categories', 'menuItems', 'menuItemOptions'] : collectionNames;

    for (const name of namesToValidate) {
      const collection = sourceData[name];
      if (!Array.isArray(collection)) {
        throw new BadRequestException(`Backup collection ${name} must be an array`);
      }
      this.assertUniqueIds(name, collection);
      data[name as CollectionName] = collection as Record<string, unknown>[];
    }

    const counts = Object.fromEntries(collectionNames.map((name) => [name, data[name].length])) as Record<CollectionName, number>;
    return {
      version: Number(candidate.version),
      data,
      counts,
      warning: candidate.version === 1 ? 'Version 1 backup only contains basic restaurant, table, and menu data.' : undefined,
    };
  }

  private assertUniqueIds(collectionName: string, rows: unknown[]) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !('id' in row)) {
        throw new BadRequestException(`Backup collection ${collectionName} row is missing id`);
      }
      const id = String((row as { id: unknown }).id);
      if (seen.has(id)) {
        throw new BadRequestException(`Backup collection ${collectionName} contains duplicate id: ${id}`);
      }
      seen.add(id);
    }
  }

  private isRestoreRequest(value: unknown): value is RestoreRequest {
    return Boolean(value && typeof value === 'object' && 'backup' in value);
  }

  private upsertRow(delegate: any, row: Record<string, unknown>) {
    return delegate.upsert({
      where: { id: this.rowId(row) },
      update: this.omitId(row),
      create: row,
    });
  }

  private rowId(row: Record<string, unknown>) {
    return String(row.id);
  }

  private omitId(row: Record<string, unknown>) {
    const { id: _id, ...rest } = row;
    return rest;
  }
}
