import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

type Range = {
  from: Date;
  to: Date;
  businessDate?: string;
  businessDayStartMinute?: number;
};

const RESTAURANT_ID = 'seed-restaurant-xidao';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async getSummary(period: ReportPeriod, dateInput?: string) {
    const range = await this.getRange(period, dateInput);

    const [orders, payments, ledgerTotals, tableCount, voidEvents] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: {
            gte: range.from,
            lt: range.to,
          },
        },
        include: {
          table: true,
          items: true,
          payments: true,
        },
      }),
      this.prisma.payment.findMany({
        where: {
          paidAt: {
            gte: range.from,
            lt: range.to,
          },
        },
      }),
      this.ledger.getTotals(range),
      this.prisma.diningTable.count({
        where: { restaurantId: RESTAURANT_ID },
      }),
      this.prisma.orderEvent.findMany({
        where: {
          eventType: 'order_item.refunded',
          createdAt: {
            gte: range.from,
            lt: range.to,
          },
        },
        include: { orderItem: true },
      }),
    ]);

    const grossSalesAmount = ledgerTotals.grossAmount;
    const voidAmount = ledgerTotals.voidAmount;
    const discountAmount = ledgerTotals.discountAmount;
    const adjustmentAmount = ledgerTotals.adjustmentAmount;
    const netSalesAmount = ledgerTotals.netSalesAmount;
    const paidAmount = ledgerTotals.paidAmount;
    const netPaidAmount = ledgerTotals.netPaidAmount;
    const unpaidAmount = Math.max(netSalesAmount - netPaidAmount, 0);
    const refundAmount = ledgerTotals.refundAmount;
    const paidOrderCount = orders.filter((order) => order.paymentStatus === 'paid').length;
    const averageOrderAmount = paidOrderCount ? Math.round(netSalesAmount / paidOrderCount) : 0;
    const tableTurnoverRate = tableCount ? Number((paidOrderCount / tableCount).toFixed(2)) : 0;

    const topItemsByName = new Map<string, { name: string; quantity: number; amount: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (item.status === 'cancelled' || item.status === 'refunded') continue;
        const current = topItemsByName.get(item.nameSnapshot) ?? { name: item.nameSnapshot, quantity: 0, amount: 0 };
        current.quantity += item.quantity;
        current.amount += item.priceSnapshot * item.quantity;
        topItemsByName.set(item.nameSnapshot, current);
      }
    }

    const paidPaymentTotal = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
    const paymentMethods = Object.values(PaymentMethod).map((method) => ({
      method,
      amount: payments.filter((payment) => payment.method === method && payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0),
    })).map((method) => ({
      ...method,
      percentage: this.percentage(method.amount, paidPaymentTotal),
    }));

    const occupiedTableIds = new Set(orders.map((order) => order.tableId));
    const voidReasons = this.buildVoidReasons(voidEvents);
    const hourlySales = this.buildHourlySales(range, orders);
    const kitchenEfficiency = this.buildKitchenEfficiency(orders);

    return {
      period,
      businessDate: range.businessDate,
      businessDayStart: range.businessDayStartMinute,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      grossSalesAmount,
      voidAmount,
      discountAmount,
      adjustmentAmount,
      netSalesAmount,
      paidAmount,
      refundAmount,
      netPaidAmount,
      unpaidAmount,
      tableCount,
      tableTurnoverRate,
      orderCount: orders.length,
      paidOrderCount,
      averageOrderAmount,
      occupiedTableCount: occupiedTableIds.size,
      topItems: [...topItemsByName.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      voidReasons,
      paymentMethods,
      hourlySales,
      kitchenEfficiency,
      grossAmount: netSalesAmount,
      unpaidOrders: orders
        .filter((order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled')
        .map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          tableName: order.table.name,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
        })),
    };
  }

  async getDailyClosing(dateInput?: string) {
    const range = await this.getRange('daily', dateInput);

    const [orders, payments, auditLogs, printJobs, ledgerTotals] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        orderBy: { createdAt: 'asc' },
        include: { table: true, items: true, payments: true },
      }),
      this.prisma.payment.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        orderBy: { createdAt: 'desc' },
        take: 80,
        include: { table: true, order: true },
      }),
      this.prisma.printJob.findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        orderBy: { createdAt: 'desc' },
        take: 80,
        include: { table: true, order: true, orderItem: true },
      }),
      this.ledger.getTotals(range),
    ]);
    const [openShift, recentShift] = await Promise.all([
      this.prisma.shift.findFirst({
        where: { restaurantId: RESTAURANT_ID, status: 'open' },
        orderBy: { openedAt: 'desc' },
        include: { openedBy: true, closedBy: true },
      }),
      this.prisma.shift.findFirst({
        where: { restaurantId: RESTAURANT_ID },
        orderBy: { openedAt: 'desc' },
        include: { openedBy: true, closedBy: true },
      }),
    ]);

    const paidPayments = payments.filter((payment) => payment.status === 'paid');
    const refundPayments = payments.filter((payment) => payment.status === 'refunded');
    const refundedItems = orders.flatMap((order) =>
      order.items
        .filter((item) => item.status === 'refunded')
        .map((item) => ({
          id: item.id,
          orderNo: order.orderNo,
          tableName: order.table.name,
          name: item.nameSnapshot,
          quantity: item.quantity,
          amount: item.priceSnapshot * item.quantity,
        })),
    );

    const paymentMethods = Object.values(PaymentMethod).map((method) => ({
      method,
      paidAmount: paidPayments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0),
      refundAmount: refundPayments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0),
    }));

    const unpaidOrders = orders
      .filter((order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled')
      .map((order) => {
        const paidAmount = order.payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
        const refundAmount = order.payments.filter((payment) => payment.status === 'refunded').reduce((sum, payment) => sum + payment.amount, 0);
        return {
          id: order.id,
          orderNo: order.orderNo,
          tableName: order.table.name,
          totalAmount: order.totalAmount,
          paidAmount,
          remainingAmount: Math.max(order.totalAmount - paidAmount + refundAmount, 0),
          paymentStatus: order.paymentStatus,
        };
      });

    const grossAmount = ledgerTotals.netSalesAmount;
    const paidAmount = ledgerTotals.paidAmount;
    const refundAmount = ledgerTotals.refundAmount;
    const voidAmount = ledgerTotals.voidAmount;
    const itemSaleAmount = ledgerTotals.grossAmount;
    const discountAmount = ledgerTotals.discountAmount;
    const adjustmentAmount = ledgerTotals.adjustmentAmount;

    return {
      date: range.from.toISOString().slice(0, 10),
      businessDate: range.businessDate,
      businessDayStart: range.businessDayStartMinute,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      totals: {
        grossAmount,
        itemSaleAmount,
        paidAmount,
        refundAmount,
        netPaidAmount: ledgerTotals.netPaidAmount,
        voidAmount,
        discountAmount,
        adjustmentAmount,
        unpaidAmount: Math.max(ledgerTotals.netSalesAmount - ledgerTotals.netPaidAmount, 0),
        orderCount: orders.length,
        paidOrderCount: orders.filter((order) => order.paymentStatus === 'paid').length,
        refundCount: refundPayments.length,
        voidItemCount: refundedItems.length,
        pendingPrintJobCount: printJobs.filter((job) => job.status === 'pending').length,
        failedPrintJobCount: printJobs.filter((job) => job.status === 'failed').length,
      },
      paymentMethods,
      refundedItems,
      unpaidOrders,
      shift: openShift ?? recentShift,
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        summary: log.summary,
        tableName: log.table?.name ?? null,
        orderNo: log.order?.orderNo ?? null,
        createdAt: log.createdAt,
      })),
      printJobs: printJobs.map((job) => ({
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        title: job.title,
        tableName: job.table?.name ?? null,
        orderNo: job.order?.orderNo ?? null,
        createdAt: job.createdAt,
      })),
    };
  }

  async getDailyClosingCheck(dateInput?: string) {
    const range = await this.getRange('daily', dateInput);
    const [orders, openTables, openShift, pendingPrintJobCount, failedPrintJobCount] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: range.from, lt: range.to },
          status: { not: 'cancelled' },
          paymentStatus: { in: ['unpaid', 'partially_paid'] },
        },
        include: { table: true, payments: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.diningTable.findMany({
        where: { restaurantId: RESTAURANT_ID, status: { in: ['occupied', 'dining', 'paying'] } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.shift.findFirst({
        where: { restaurantId: RESTAURANT_ID, status: 'open' },
        orderBy: { openedAt: 'desc' },
        include: { openedBy: true },
      }),
      this.prisma.printJob.count({
        where: { createdAt: { gte: range.from, lt: range.to }, status: 'pending' },
      }),
      this.prisma.printJob.count({
        where: { createdAt: { gte: range.from, lt: range.to }, status: 'failed' },
      }),
    ]);

    const unpaidOrders = orders.map((order) => {
      const paidAmount = order.payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
      const refundAmount = order.payments.filter((payment) => payment.status === 'refunded').reduce((sum, payment) => sum + payment.amount, 0);
      return {
        id: order.id,
        orderNo: order.orderNo,
        tableName: order.table.name,
        totalAmount: order.totalAmount,
        paidAmount,
        remainingAmount: Math.max(order.totalAmount - paidAmount + refundAmount, 0),
        paymentStatus: order.paymentStatus,
      };
    });

    return {
      canClose: unpaidOrders.length === 0 && openTables.length === 0 && !openShift,
      businessDate: range.businessDate,
      businessDayStart: range.businessDayStartMinute,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      unpaidOrders,
      openTables,
      openShift,
      pendingPrintJobCount,
      failedPrintJobCount,
    };
  }

  private async getRange(period: ReportPeriod, dateInput?: string): Promise<Range> {
    const baseDate = dateInput ? new Date(`${dateInput}T00:00:00`) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const from = new Date(baseDate);
    from.setHours(0, 0, 0, 0);

    if (period === 'daily') {
      const businessDayStartMinute = await this.getBusinessDayStartMinute();
      const businessFrom = this.addMinutes(from, businessDayStartMinute);
      return {
        from: businessFrom,
        to: this.addDays(businessFrom, 1),
        businessDate: this.formatDate(from),
        businessDayStartMinute,
      };
    }

    if (period === 'weekly') {
      const day = from.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekFrom = this.addDays(from, mondayOffset);
      return { from: weekFrom, to: this.addDays(weekFrom, 7) };
    }

    if (period === 'monthly') {
      const monthFrom = new Date(from.getFullYear(), from.getMonth(), 1);
      return { from: monthFrom, to: new Date(from.getFullYear(), from.getMonth() + 1, 1) };
    }

    if (period === 'quarterly') {
      const quarterStartMonth = Math.floor(from.getMonth() / 3) * 3;
      const quarterFrom = new Date(from.getFullYear(), quarterStartMonth, 1);
      return { from: quarterFrom, to: new Date(from.getFullYear(), quarterStartMonth + 3, 1) };
    }

    if (period === 'yearly') {
      const yearFrom = new Date(from.getFullYear(), 0, 1);
      return { from: yearFrom, to: new Date(from.getFullYear() + 1, 0, 1) };
    }

    throw new BadRequestException('Invalid period');
  }

  private async getBusinessDayStartMinute() {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: RESTAURANT_ID },
      select: { businessDayStartMinute: true },
    });
    return restaurant?.businessDayStartMinute ?? 0;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private addMinutes(date: Date, minutes: number) {
    const next = new Date(date);
    next.setMinutes(next.getMinutes() + minutes);
    return next;
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private percentage(amount: number, total: number) {
    if (!total) return 0;
    return Math.round((amount / total) * 10000) / 100;
  }

  private buildVoidReasons(events: { reason: string | null; amountDelta: number; orderItem?: { priceSnapshot: number; quantity: number } | null }[]) {
    const reasons = new Map<string, { reason: string; count: number; amount: number }>();

    for (const event of events) {
      const reason = event.reason?.trim() || '未填写';
      const current = reasons.get(reason) ?? { reason, count: 0, amount: 0 };
      current.count += 1;
      current.amount += Math.abs(event.amountDelta || (event.orderItem ? event.orderItem.priceSnapshot * event.orderItem.quantity : 0));
      reasons.set(reason, current);
    }

    return [...reasons.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
  }

  private buildHourlySales(range: Range, orders: { createdAt: Date; totalAmount: number }[]) {
    const buckets = Array.from({ length: 24 }, (_, index) => {
      const hourDate = this.addHours(range.from, index);
      return {
        hour: `${String(hourDate.getHours()).padStart(2, '0')}:00`,
        orderCount: 0,
        salesAmount: 0,
      };
    });

    for (const order of orders) {
      const bucket = buckets.find((candidate) => candidate.hour === `${String(order.createdAt.getHours()).padStart(2, '0')}:00`);
      if (!bucket) continue;
      bucket.orderCount += 1;
      bucket.salesAmount += order.totalAmount;
    }

    return buckets;
  }

  private buildKitchenEfficiency(orders: { items: { createdAt: Date; readyAt?: Date | null; servedAt?: Date | null }[] }[]) {
    const readyMinutes: number[] = [];
    const serveMinutes: number[] = [];
    const overdueThresholdMinutes = 20;
    let overdueItemCount = 0;

    for (const item of orders.flatMap((order) => order.items)) {
      if (item.readyAt) {
        const ready = this.diffMinutes(item.createdAt, item.readyAt);
        readyMinutes.push(ready);
        if (ready > overdueThresholdMinutes) overdueItemCount += 1;
      }

      if (item.readyAt && item.servedAt) {
        serveMinutes.push(this.diffMinutes(item.readyAt, item.servedAt));
      }
    }

    return {
      averageReadyMinutes: this.averageMinutes(readyMinutes),
      averageServeMinutes: this.averageMinutes(serveMinutes),
      overdueItemCount,
      overdueThresholdMinutes,
    };
  }

  private addHours(date: Date, hours: number) {
    const next = new Date(date);
    next.setHours(next.getHours() + hours);
    return next;
  }

  private diffMinutes(from: Date, to: Date) {
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  }

  private averageMinutes(values: number[]) {
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
}
