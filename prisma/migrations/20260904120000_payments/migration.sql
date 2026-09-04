-- PHASE-09 / 09-A rental payments. (09-A01) one payment intent per
-- booking carrying the snapshot totals and the OPEN to PARTIALLY_SETTLED
-- to SETTLED financial state. (09-A02/09-A03/09-A05/09-A08) auditable
-- manual payment records (cash, bank transfer with reference evidence,
-- other manual) with the pending-confirmation workflow. (09-A06) the
-- deposit hold lifecycle kept separate from rental revenue (06-C08,
-- docs/06 financial integrity).

CREATE TYPE "PaymentIntentStatus" AS ENUM ('OPEN', 'PARTIALLY_SETTLED', 'SETTLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'OTHER_MANUAL');
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'VOIDED');
CREATE TYPE "DepositHoldStatus" AS ENUM ('HELD', 'RELEASED', 'REFUNDED', 'FORFEITED');

CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "depositMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "recordedById" UUID,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deposit_holds" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" "DepositHoldStatus" NOT NULL DEFAULT 'HELD',
    "releasedById" UUID,
    "releasedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_intents_bookingId_key" ON "payment_intents"("bookingId");
CREATE UNIQUE INDEX "deposit_holds_intentId_key" ON "deposit_holds"("intentId");
CREATE UNIQUE INDEX "deposit_holds_bookingId_key" ON "deposit_holds"("bookingId");

CREATE INDEX "payment_intents_tenantId_status_idx" ON "payment_intents"("tenantId", "status");
CREATE INDEX "payment_records_intentId_createdAt_idx" ON "payment_records"("intentId", "createdAt");

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_intentId_fkey"
    FOREIGN KEY ("intentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deposit_holds" ADD CONSTRAINT "deposit_holds_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deposit_holds" ADD CONSTRAINT "deposit_holds_intentId_fkey"
    FOREIGN KEY ("intentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deposit_holds" ADD CONSTRAINT "deposit_holds_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deposit_holds" ADD CONSTRAINT "deposit_holds_releasedById_fkey"
    FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
