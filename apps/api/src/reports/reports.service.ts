import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

type Range = {
  from: Date;
  to: Date;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async getSummary(period: ReportPeriod, dateInput?: string) {
    const range = this.getRange(period, dateInput);

    const [orders, payments, ledgerTotals] = await Promise.all([
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
    ]);

    const grossAmount = ledgerTotals.netSalesAmount;
    const paidAmount = ledgerTotals.paidAmount;
    const unpaidAmount = Math.max(ledgerTotals.netSalesAmount - ledgerTotals.netPaidAmount, 0);
    const refundAmount = ledgerTotals.refundAmount;

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

    const paymentMethods = Object.values(PaymentMethod).map((method) => ({
      method,
      amount: payments.filter((payment) => payment.method === method && payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0),
    }));

    const occupiedTableIds = new Set(orders.map((order) => order.tableId));

    return {
      period,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      grossAmount,
      paidAmount,
      netPaidAmount: ledgerTotals.netPaidAmount,
      voidAmount: ledgerTotals.voidAmount,
      unpaidAmount,
      refundAmount,
      orderCount: orders.length,
      paidOrderCount: orders.filter((order) => order.paymentStatus === 'paid').length,
      averageOrderAmount: orders.length ? Math.round(grossAmount / orders.length) : 0,
      occupiedTableCount: occupiedTableIds.size,
      topItems: [...topItemsByName.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      paymentMethods,
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
    const range = this.getRange('daily', dateInput);

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

    return {
      date: range.from.toISOString().slice(0, 10),
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      totals: {
        grossAmount,
        paidAmount,
        refundAmount,
        netPaidAmount: ledgerTotals.netPaidAmount,
        voidAmount,
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

  private getRange(period: ReportPeriod, dateInput?: string): Range {
    const baseDate = dateInput ? new Date(`${dateInput}T00:00:00`) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const from = new Date(baseDate);
    from.setHours(0, 0, 0, 0);

    if (period === 'daily') {
      return { from, to: this.addDays(from, 1) };
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

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
}
