-- CreateEnum
CREATE TYPE "ServiceCallStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'cancelled');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cooking_started_at" TIMESTAMP(3),
ADD COLUMN     "ready_at" TIMESTAMP(3),
ADD COLUMN     "served_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "service_calls" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "order_id" TEXT,
    "status" "ServiceCallStatus" NOT NULL DEFAULT 'open',
    "message" TEXT,
    "handled_by_user_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_calls_restaurant_id_status_created_at_idx" ON "service_calls"("restaurant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "service_calls_table_id_status_idx" ON "service_calls"("table_id", "status");

-- CreateIndex
CREATE INDEX "order_items_status_created_at_idx" ON "order_items"("status", "created_at");

-- AddForeignKey
ALTER TABLE "service_calls" ADD CONSTRAINT "service_calls_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_calls" ADD CONSTRAINT "service_calls_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_calls" ADD CONSTRAINT "service_calls_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_calls" ADD CONSTRAINT "service_calls_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
