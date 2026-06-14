-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('item_sale', 'item_void', 'payment_received', 'payment_refund', 'discount', 'adjustment');

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "table_id" TEXT,
    "order_id" TEXT,
    "order_item_id" TEXT,
    "payment_id" TEXT,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "source_id" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_restaurant_id_occurred_at_idx" ON "ledger_entries"("restaurant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ledger_entries_order_id_occurred_at_idx" ON "ledger_entries"("order_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ledger_entries_entry_type_occurred_at_idx" ON "ledger_entries"("entry_type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_entry_type_source_id_key" ON "ledger_entries"("entry_type", "source_id");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
