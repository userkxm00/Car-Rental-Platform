-- PHASE-09 / 09-B financial ledger. (09-B06) ledger_transactions is the
-- immutable append-only financial event log for each booking. (09-B02
-- and 09-B03) invoices hold the settlement items assembled server-side
-- from the immutable booking snapshot, with void instead of deletion so
-- historical documents never change (docs/06 financial integrity).

CREATE TYPE "LedgerTransactionKind" AS ENUM ('PAYMENT_CONFIRMED', 'PAYMENT_VOIDED', 'DEPOSIT_HELD', 'DEPOSIT_RELEASED', 'INVOICE_ISSUED', 'INVOICE_VOIDED');
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOIDED');

CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "kind" "LedgerTransactionKind" NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID,
    "actorUserId" UUID,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" TEXT NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "issuedById" UUID,
    "voidedById" UUID,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");
CREATE UNIQUE INDEX "invoices_booking_active_key" ON "invoices"("bookingId") WHERE "status" = 'ISSUED';

CREATE INDEX "ledger_transactions_bookingId_createdAt_idx" ON "ledger_transactions"("bookingId", "createdAt");
CREATE INDEX "ledger_transactions_tenantId_createdAt_idx" ON "ledger_transactions"("tenantId", "createdAt");
CREATE INDEX "invoices_bookingId_createdAt_idx" ON "invoices"("bookingId", "createdAt");

ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuedById_fkey"
    FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voidedById_fkey"
    FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
