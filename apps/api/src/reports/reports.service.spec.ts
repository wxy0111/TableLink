import { describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

function createService(businessDayStartMinute = 0) {
  const createdAt = new Date('2026-06-18T03:00:00');
  const laterCreatedAt = new Date('2026-06-18T04:00:00');
  const prisma = {
    restaurant: {
      findFirst: vi.fn().mockResolvedValue({ businessDayStartMinute }),
    },
    order: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'order-1',
          orderNo: 'ORDER-1',
          table: { name: 'A01' },
          tableId: 'table-1',
          totalAmount: 3000,
          paymentStatus: 'partially_paid',
          status: 'accepted',
          createdAt,
          payments: [{ amount: 1000, status: 'paid' }],
          items: [
            {
              id: 'item-1',
              status: 'submitted',
              nameSnapshot: 'Rice',
              quantity: 1,
              priceSnapshot: 3000,
              createdAt,
              readyAt: new Date('2026-06-18T03:12:00'),
              servedAt: new Date('2026-06-18T03:18:00'),
            },
          ],
        },
        {
          id: 'order-2',
          orderNo: 'ORDER-2',
          table: { name: 'A02' },
          tableId: 'table-2',
          totalAmount: 2000,
          paymentStatus: 'paid',
          status: 'served',
          createdAt: laterCreatedAt,
          payments: [{ amount: 2000, status: 'paid' }],
          items: [
            {
              id: 'item-2',
              status: 'refunded',
              nameSnapshot: 'Tea',
              quantity: 2,
              priceSnapshot: 400,
              createdAt: laterCreatedAt,
              readyAt: new Date('2026-06-18T04:30:00'),
              servedAt: new Date('2026-06-18T04:40:00'),
            },
            {
              id: 'item-3',
              status: 'served',
              nameSnapshot: 'Rice',
              quantity: 2,
              priceSnapshot: 1000,
              createdAt: laterCreatedAt,
              readyAt: new Date('2026-06-18T04:10:00'),
              servedAt: new Date('2026-06-18T04:15:00'),
            },
          ],
        },
      ]),
    },
    orderEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'event-1',
          eventType: 'order_item.refunded',
          reason: '做错菜',
          amountDelta: -800,
          orderItem: { id: 'item-2', priceSnapshot: 400, quantity: 2 },
        },
      ]),
    },
    payment: {
      findMany: vi.fn().mockResolvedValue([
        { method: 'cash', status: 'paid', amount: 1000 },
        { method: 'wechat', status: 'pending', amount: 9000 },
        { method: 'wechat', status: 'paid', amount: 2000 },
        { method: 'wechat', status: 'refunded', amount: 500 },
      ]),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([{ id: 'audit-1', action: 'payment.created', summary: 'paid', table: { name: 'A01' }, order: { orderNo: 'ORDER-1' }, createdAt }]),
    },
    printJob: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'print-1', jobType: 'receipt', status: 'pending', title: 'receipt', table: { name: 'A01' }, order: { orderNo: 'ORDER-1' }, orderItem: null, createdAt },
      ]),
      count: vi.fn().mockResolvedValue(0),
    },
    shift: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    diningTable: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(4),
    },
  };
  const ledger = {
    getTotals: vi.fn().mockResolvedValue({
      grossAmount: 5000,
      voidAmount: 800,
      discountAmount: 300,
      adjustmentAmount: 100,
      paidAmount: 3000,
      refundAmount: 500,
      netSalesAmount: 4000,
      netPaidAmount: 2500,
    }),
  };

  return {
    prisma,
    ledger,
    service: new ReportsService(prisma as unknown as PrismaService, ledger as unknown as LedgerService),
  };
}

describe('ReportsService', () => {
  it('keeps natural-day range when businessDayStartMinute is 0', async () => {
    const { ledger, service } = createService(0);

    const closing = await service.getDailyClosing('2026-06-18');

    expect(closing.businessDate).toBe('2026-06-18');
    expect(closing.businessDayStart).toBe(0);
    expect(closing.from).toBe(new Date('2026-06-18T00:00:00').toISOString());
    expect(closing.to).toBe(new Date('2026-06-19T00:00:00').toISOString());
    expect(ledger.getTotals).toHaveBeenCalledWith(expect.objectContaining({ from: new Date('2026-06-18T00:00:00'), to: new Date('2026-06-19T00:00:00') }));
  });

  it('uses business-day range for daily closing when start time is 05:00', async () => {
    const { service } = createService(300);

    const closing = await service.getDailyClosing('2026-06-18');

    expect(closing.businessDate).toBe('2026-06-18');
    expect(closing.businessDayStart).toBe(300);
    expect(closing.from).toBe(new Date('2026-06-18T05:00:00').toISOString());
    expect(closing.to).toBe(new Date('2026-06-19T05:00:00').toISOString());
  });

  it('builds daily closing from ledger totals, payments, unpaid orders, payment methods, and shift', async () => {
    const { prisma, service } = createService(0);
    prisma.shift.findFirst.mockResolvedValueOnce({ id: 'shift-1', status: 'open' });

    const closing = await service.getDailyClosing('2026-06-18');

    expect(closing.totals.grossAmount).toBe(4000);
    expect(closing.totals.itemSaleAmount).toBe(5000);
    expect(closing.totals.discountAmount).toBe(300);
    expect(closing.totals.adjustmentAmount).toBe(100);
    expect(closing.totals.netPaidAmount).toBe(2500);
    expect(closing.totals.unpaidAmount).toBe(1500);
    expect(closing.totals.voidAmount).toBe(800);
    expect(closing.paymentMethods.find((method) => method.method === 'wechat')).toEqual({ method: 'wechat', paidAmount: 2000, refundAmount: 500 });
    expect(closing.unpaidOrders).toEqual([
      expect.objectContaining({
        id: 'order-1',
        remainingAmount: 2000,
        paymentStatus: 'partially_paid',
      }),
    ]);
    expect(closing.shift).toEqual({ id: 'shift-1', status: 'open' });
  });

  it('builds enhanced summary metrics from ledger, orders, payments, tables, void reasons, and kitchen timings', async () => {
    const { service } = createService(0);

    const summary = await service.getSummary('daily', '2026-06-18');

    expect(summary.grossSalesAmount).toBe(5000);
    expect(summary.netSalesAmount).toBe(4000);
    expect(summary.unpaidAmount).toBe(1500);
    expect(summary.averageOrderAmount).toBe(4000);
    expect(summary.tableCount).toBe(4);
    expect(summary.tableTurnoverRate).toBe(0.25);
    expect(summary.topItems).toEqual([{ name: 'Rice', quantity: 3, amount: 5000 }]);
    expect(summary.paymentMethods.find((method) => method.method === 'cash')).toEqual({ method: 'cash', amount: 1000, percentage: 33.33 });
    expect(summary.paymentMethods.find((method) => method.method === 'wechat')).toEqual({ method: 'wechat', amount: 2000, percentage: 66.67 });
    expect(summary.voidReasons).toEqual([{ reason: '做错菜', count: 1, amount: 800 }]);
    expect(summary.hourlySales.find((hour) => hour.hour === '03:00')).toEqual({ hour: '03:00', orderCount: 1, salesAmount: 3000 });
    expect(summary.hourlySales.find((hour) => hour.hour === '04:00')).toEqual({ hour: '04:00', orderCount: 1, salesAmount: 2000 });
    expect(summary.kitchenEfficiency).toEqual({
      averageReadyMinutes: 17,
      averageServeMinutes: 7,
      overdueItemCount: 1,
      overdueThresholdMinutes: 20,
    });
  });

  it('returns zero and empty enhanced summary metrics when there is no data', async () => {
    const { prisma, ledger, service } = createService(0);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.orderEvent.findMany.mockResolvedValue([]);
    prisma.diningTable.count.mockResolvedValue(0);
    ledger.getTotals.mockResolvedValue({
      grossAmount: 0,
      voidAmount: 0,
      discountAmount: 0,
      adjustmentAmount: 0,
      paidAmount: 0,
      refundAmount: 0,
      netSalesAmount: 0,
      netPaidAmount: 0,
    });

    const summary = await service.getSummary('daily', '2026-06-18');

    expect(summary.averageOrderAmount).toBe(0);
    expect(summary.tableTurnoverRate).toBe(0);
    expect(summary.topItems).toEqual([]);
    expect(summary.voidReasons).toEqual([]);
    expect(summary.paymentMethods.every((method) => method.amount === 0 && method.percentage === 0)).toBe(true);
    expect(summary.hourlySales).toHaveLength(24);
    expect(summary.kitchenEfficiency).toEqual({
      averageReadyMinutes: 0,
      averageServeMinutes: 0,
      overdueItemCount: 0,
      overdueThresholdMinutes: 20,
    });
  });

  it('prevents closing when unpaid orders exist', async () => {
    const { service } = createService(0);

    const check = await service.getDailyClosingCheck('2026-06-18');

    expect(check.canClose).toBe(false);
    expect(check.unpaidOrders).toHaveLength(2);
  });

  it('prevents closing when a reopened paid order is partially paid', async () => {
    const { prisma, service } = createService(0);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-reopened',
        orderNo: 'ORDER-REOPENED',
        table: { name: 'A01' },
        totalAmount: 3000,
        paymentStatus: 'partially_paid',
        status: 'served',
        payments: [{ amount: 3000, status: 'paid' }],
      },
    ]);

    const check = await service.getDailyClosingCheck('2026-06-18');

    expect(check.canClose).toBe(false);
    expect(check.unpaidOrders).toEqual([expect.objectContaining({ id: 'order-reopened', paymentStatus: 'partially_paid' })]);
  });

  it('prevents closing when tables are still open', async () => {
    const { prisma, service } = createService(0);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.diningTable.findMany.mockResolvedValue([{ id: 'table-1', name: 'A01', status: 'dining' }]);

    const check = await service.getDailyClosingCheck('2026-06-18');

    expect(check.canClose).toBe(false);
    expect(check.openTables).toEqual([{ id: 'table-1', name: 'A01', status: 'dining' }]);
  });

  it('allows closing when there are no unpaid orders, open tables, or open shifts', async () => {
    const { prisma, service } = createService(0);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.diningTable.findMany.mockResolvedValue([]);
    prisma.shift.findFirst.mockResolvedValue(null);

    const check = await service.getDailyClosingCheck('2026-06-18');

    expect(check.canClose).toBe(true);
  });
});
