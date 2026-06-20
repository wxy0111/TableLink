CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed');

ALTER TABLE "restaurants" ADD COLUMN "business_day_start_minute" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "shifts" (
  "id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "opened_by_user_id" TEXT,
  "closed_by_user_id" TEXT,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "opening_cash_amount" INTEGER NOT NULL DEFAULT 0,
  "closing_cash_amount" INTEGER,
  "note" TEXT,
  "status" "ShiftStatus" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shifts_restaurant_id_status_opened_at_idx" ON "shifts"("restaurant_id", "status", "opened_at");

ALTER TABLE "shifts" ADD CONSTRAINT "shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
