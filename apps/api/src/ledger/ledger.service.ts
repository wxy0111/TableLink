import { Injectable } from '@nestjs/common';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

type LedgerEntryInput = {
  restaurantId: string;
  tableId?: string | null;
  orderId?: string | null;
  orderItemId?: string | null;
  paymentId?: string | null;
  entryType: LedgerEntryType;
  amount: number;
  sourceId: string;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

type Range = {
  from: Date;
  to: Date;
};

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  createEntry(tx: Tx, input: LedgerEntryInput) {
    return tx.ledgerEntry.upsert({
      where: {
        entryType_sourceId: {
          entryType: input.entryType,
          sourceId: input.sourceId,
        },
      },
      update: {
        restaurantId: input.restaurantId,
        tableId: input.tableId ?? null,
        orderId: input.orderId ?? null,
        orderItemId: input.orderItemId ?? null,
        paymentId: input.paymentId ?? null,
        amount: input.amount,
        note: input.note ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        occurredAt: input.occurredAt ?? new Date(),
      },
      create: {
        restaurantId: input.restaurantId,
        tableId: input.tableId ?? null,
        orderId: input.orderId ?? null,
        orderItemId: input.orderItemId ?? null,
        paymentId: input.paymentId ?? null,
        entryType: input.entryType,
        amount: input.amount,
        sourceId: input.sourceId,
        note: input.note ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  }

  createItemSale(tx: Tx, input: Omit<LedgerEntryInput, 'entryType'>) {
    return this.createEntry(tx, { ...input, entryType: 'item_sale' });
  }

  createItemVoid(tx: Tx, input: Omit<LedgerEntryInput, 'entryType'>) {
    return this.createEntry(tx, { ...input, entryType: 'item_void' });
  }

  createPaymentReceived(tx: Tx, input: Omit<LedgerEntryInput, 'entryType'>) {
    return this.createEntry(tx, { ...input, entryType: 'payment_received' });
  }

  createPaymentRefund(tx: Tx, input: Omit<LedgerEntryInput, 'entryType'>) {
    return this.createEntry(tx, { ...input, entryType: 'payment_refund' });
  }

  createDiscount(tx: Tx, input: Omit<LedgerEntryInput, 'entryType'>) {
    return this.createEntry(tx, { ...input, entryType: 'discount' });
  }

  createAdjustment(tx: Tx, input: Omit<LedgerEntryInput, 'entryType'>) {
    return this.createEntry(tx, { ...input, entryType: 'adjustment' });
  }

  async getTotals(range: Range) {
    const grouped = await this.prisma.ledgerEntry.groupBy({
      by: ['entryType'],
      where: {
        occurredAt: {
          gte: range.from,
          lt: range.to,
        },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const amount = (entryType: LedgerEntryType) => grouped.find((entry) => entry.entryType === entryType)?._sum.amount ?? 0;
    const count = (entryType: LedgerEntryType) => grouped.find((entry) => entry.entryType === entryType)?._count.id ?? 0;

    return {
      grossAmount: amount('item_sale'),
      voidAmount: amount('item_void'),
      discountAmount: amount('discount'),
      adjustmentAmount: amount('adjustment'),
      paidAmount: amount('payment_received'),
      refundAmount: amount('payment_refund'),
      netSalesAmount: amount('item_sale') - amount('item_void') - amount('discount') + amount('adjustment'),
      netPaidAmount: amount('payment_received') - amount('payment_refund'),
      saleEntryCount: count('item_sale'),
      voidEntryCount: count('item_void'),
      discountEntryCount: count('discount'),
      adjustmentEntryCount: count('adjustment'),
      paymentEntryCount: count('payment_received'),
      refundEntryCount: count('payment_refund'),
    };
  }
}
