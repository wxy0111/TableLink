ALTER TYPE "PaymentRecordStatus" ADD VALUE IF NOT EXISTS 'closed';

CREATE TYPE "PaymentChannel" AS ENUM ('manual', 'online');

ALTER TABLE "payments"
  ADD COLUMN "channel" "PaymentChannel" NOT NULL DEFAULT 'manual',
  ADD COLUMN "provider_trade_no" TEXT,
  ADD COLUMN "merchant_trade_no" TEXT,
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "raw_payload" JSONB;

CREATE UNIQUE INDEX "payments_merchant_trade_no_key" ON "payments"("merchant_trade_no");
