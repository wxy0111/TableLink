import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

describe('LedgerService', () => {
  it('summarizes sales, voids, payments, refunds, and net amounts', async () => {
    const prisma = {
      ledgerEntry: {
        groupBy: vi.fn().mockResolvedValue([
          { entryType: 'item_sale', _sum: { amount: 5000 }, _count: { id: 3 } },
          { entryType: 'item_void', _sum: { amount: 800 }, _count: { id: 1 } },
          { entryType: 'discount', _sum: { amount: 300 }, _count: { id: 1 } },
          { entryType: 'adjustment', _sum: { amount: 100 }, _count: { id: 1 } },
          { entryType: 'payment_received', _sum: { amount: 4500 }, _count: { id: 2 } },
          { entryType: 'payment_refund', _sum: { amount: 500 }, _count: { id: 1 } },
        ]),
      },
    };
    const service = new LedgerService(prisma as unknown as PrismaService);

    const totals = await service.getTotals({ from: new Date('2026-06-18T00:00:00Z'), to: new Date('2026-06-19T00:00:00Z') });

    expect(totals.netSalesAmount).toBe(4000);
    expect(totals.netPaidAmount).toBe(4000);
    expect(totals.grossAmount).toBe(5000);
    expect(totals.voidAmount).toBe(800);
    expect(totals.discountAmount).toBe(300);
    expect(totals.adjustmentAmount).toBe(100);
    expect(totals.refundAmount).toBe(500);
  });
});
