import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRINT_JOB_TYPES } from '../print/print-job-types';
import { RealtimeService } from '../realtime/realtime.service';
import { StateMachineService } from '../workflow/state-machine.service';
import { ClearTableDto, MergeTablesDto, MoveTableDto, OpenTableDto } from './dto/frontdesk-table.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: StateMachineService,
    private readonly realtime: RealtimeService,
  ) {}

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
          where: { paymentStatus: { in: ['unpaid', 'partially_paid', 'paid'] }, status: { not: 'cancelled' } },
          orderBy: { createdAt: 'desc' },
          include: { items: true, payments: true },
        },
      },
    });
  }

  async openTable(tableId: string, dto: OpenTableDto) {
    const table = await this.findTable(tableId);
    const activeOrder = await this.findLatestActiveOrder(tableId);

    if (activeOrder) {
      throw new BadRequestException('Table already has an active order');
    }

    const orderNo = this.createOrderNo();
    this.stateMachine.assertTableTransition(table.status, 'occupied');

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          restaurantId: table.restaurantId,
          tableId,
          orderNo,
          status: 'accepted',
          remark: dto.note,
          createdByType: 'staff',
          events: {
            create: {
              eventType: 'table.opened',
              toStatus: 'accepted',
              operatorType: 'staff',
              reason: dto.note,
            },
          },
          auditLogs: {
            create: {
              restaurantId: table.restaurantId,
              tableId,
              action: 'table.opened',
              operatorType: 'staff',
              summary: `开台 ${table.name}`,
              metadata: { note: dto.note ?? null },
            },
          },
          printJobs: {
            create: {
              restaurantId: table.restaurantId,
              tableId,
              jobType: PRINT_JOB_TYPES.frontdeskOpenTable,
              title: `开台 ${table.name}`,
              payload: { tableName: table.name, orderNo, note: dto.note ?? null },
            },
          },
        },
        include: { table: true, items: true, payments: true },
      });

      const updatedTable = await tx.diningTable.update({
        where: { id: tableId },
        data: { status: 'occupied' },
      });

      this.publishTablesChanged();
      return { table: updatedTable, order };
    });
  }

  async moveTable(sourceTableId: string, dto: MoveTableDto) {
    if (sourceTableId === dto.targetTableId) {
      throw new BadRequestException('Source and target table cannot be the same');
    }

    const [sourceTable, targetTable] = await Promise.all([this.findTable(sourceTableId), this.findTable(dto.targetTableId)]);
    const activeOrders = await this.findActiveOrders(sourceTableId);

    if (activeOrders.length === 0) {
      throw new BadRequestException('Source table has no active orders');
    }
    this.stateMachine.assertTableTransition(sourceTable.status, 'idle');
    this.stateMachine.assertTableTransition(targetTable.status, 'dining');

    return this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id: { in: activeOrders.map((order) => order.id) } },
        data: { tableId: targetTable.id },
      });

      for (const order of activeOrders) {
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            eventType: 'table.moved',
            operatorType: 'staff',
            reason: dto.reason,
            metadata: { fromTableId: sourceTable.id, fromTableName: sourceTable.name, toTableId: targetTable.id, toTableName: targetTable.name },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          restaurantId: sourceTable.restaurantId,
          tableId: targetTable.id,
          action: 'table.moved',
          operatorType: 'staff',
          summary: `换桌 ${sourceTable.name} -> ${targetTable.name}`,
          metadata: { sourceTableId, targetTableId: targetTable.id, orderIds: activeOrders.map((order) => order.id), reason: dto.reason ?? null },
        },
      });

      await tx.printJob.create({
        data: {
          restaurantId: sourceTable.restaurantId,
          tableId: targetTable.id,
          jobType: PRINT_JOB_TYPES.frontdeskMoveTable,
          title: `换桌 ${sourceTable.name} -> ${targetTable.name}`,
          payload: { sourceTableName: sourceTable.name, targetTableName: targetTable.name, orderNos: activeOrders.map((order) => order.orderNo), reason: dto.reason ?? null },
        },
      });

      await tx.diningTable.update({ where: { id: sourceTable.id }, data: { status: 'idle' } });
      const updatedTarget = await tx.diningTable.update({ where: { id: targetTable.id }, data: { status: 'dining' } });

      this.publishTablesChanged();
      return { sourceTable: { ...sourceTable, status: 'idle' }, targetTable: updatedTarget, movedOrders: activeOrders.length };
    });
  }

  async mergeTables(dto: MergeTablesDto) {
    if (dto.sourceTableId === dto.targetTableId) {
      throw new BadRequestException('Source and target table cannot be the same');
    }

    const [sourceTable, targetTable] = await Promise.all([this.findTable(dto.sourceTableId), this.findTable(dto.targetTableId)]);
    const activeOrders = await this.findActiveOrders(sourceTable.id);

    if (activeOrders.length === 0) {
      throw new BadRequestException('Source table has no active orders');
    }
    this.stateMachine.assertTableTransition(sourceTable.status, 'idle');
    this.stateMachine.assertTableTransition(targetTable.status, 'dining');

    return this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id: { in: activeOrders.map((order) => order.id) } },
        data: { tableId: targetTable.id },
      });

      for (const order of activeOrders) {
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            eventType: 'table.merged',
            operatorType: 'staff',
            reason: dto.reason,
            metadata: { fromTableId: sourceTable.id, fromTableName: sourceTable.name, toTableId: targetTable.id, toTableName: targetTable.name },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          restaurantId: sourceTable.restaurantId,
          tableId: targetTable.id,
          action: 'table.merged',
          operatorType: 'staff',
          summary: `并桌 ${sourceTable.name} -> ${targetTable.name}`,
          metadata: { sourceTableId: sourceTable.id, targetTableId: targetTable.id, orderIds: activeOrders.map((order) => order.id), reason: dto.reason ?? null },
        },
      });

      await tx.printJob.create({
        data: {
          restaurantId: sourceTable.restaurantId,
          tableId: targetTable.id,
          jobType: PRINT_JOB_TYPES.frontdeskMergeTable,
          title: `并桌 ${sourceTable.name} -> ${targetTable.name}`,
          payload: { sourceTableName: sourceTable.name, targetTableName: targetTable.name, orderNos: activeOrders.map((order) => order.orderNo), reason: dto.reason ?? null },
        },
      });

      await tx.diningTable.update({ where: { id: sourceTable.id }, data: { status: 'idle' } });
      const updatedTarget = await tx.diningTable.update({ where: { id: targetTable.id }, data: { status: 'dining' } });

      this.publishTablesChanged();
      return { sourceTable: { ...sourceTable, status: 'idle' }, targetTable: updatedTarget, mergedOrders: activeOrders.length };
    });
  }

  async clearTable(tableId: string, dto: ClearTableDto) {
    const table = await this.findTable(tableId);
    const unpaidOrders = await this.prisma.order.count({
      where: {
        tableId,
        status: { not: 'cancelled' },
        paymentStatus: { in: ['unpaid', 'partially_paid'] },
      },
    });

    if (unpaidOrders > 0) {
      throw new BadRequestException('Cannot clear table with unpaid orders');
    }
    this.stateMachine.assertTableTransition(table.status, 'idle');

    return this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          restaurantId: table.restaurantId,
          tableId,
          action: 'table.cleared',
          operatorType: 'staff',
          summary: `清台 ${table.name}`,
          metadata: { reason: dto.reason ?? null },
        },
      });

      await tx.printJob.create({
        data: {
          restaurantId: table.restaurantId,
          tableId,
          jobType: PRINT_JOB_TYPES.frontdeskClearTable,
          title: `清台 ${table.name}`,
          payload: { tableName: table.name, reason: dto.reason ?? null },
        },
      });

      const updatedTable = await tx.diningTable.update({
        where: { id: tableId },
        data: { status: 'idle' },
      });

      this.publishTablesChanged();
      return updatedTable;
    });
  }

  private publishTablesChanged() {
    this.realtime.publish({ type: 'staff.tables.updated' });
    this.realtime.publish({ type: 'admin.reports.updated' });
    this.realtime.publish({ type: 'print.updated' });
  }

  private async findTable(tableId: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { id: tableId } });
    if (!table) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }

  private findLatestActiveOrder(tableId: string) {
    return this.prisma.order.findFirst({
      where: {
        tableId,
        status: { not: 'cancelled' },
        paymentStatus: { in: ['unpaid', 'partially_paid'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private findActiveOrders(tableId: string) {
    return this.prisma.order.findMany({
      where: {
        tableId,
        status: { not: 'cancelled' },
        paymentStatus: { in: ['unpaid', 'partially_paid', 'refunded'] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private createOrderNo() {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${ymd}-${suffix}`;
  }
}
