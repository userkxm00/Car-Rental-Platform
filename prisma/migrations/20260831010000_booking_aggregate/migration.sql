-- 05-B: booking aggregate — bookings, append-only status history,
-- price-snapshot linkage (filled by PHASE-06), per-tenant booking number
-- counters and the booking→hold linkage (05-B05).
--
-- The quote inventory mode type is shared with bookings, hence the rename.

ALTER TYPE "QuoteInventoryMode" RENAME TO "InventoryMode";

CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'HOLD', 'PENDING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_PICKUP', 'ACTIVE', 'RETURN_PENDING', 'RETURNED', 'SETTLEMENT_PENDING', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'REJECTED');

CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "channel" "BookingChannel" NOT NULL,
    "inventoryMode" "InventoryMode" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" UUID,
    "createdBy" UUID,
    "quoteId" UUID,
    "requestedCategoryId" UUID,
    "assignedVehicleId" UUID,
    "pickupBranchId" UUID,
    "returnBranchId" UUID,
    "deliveryZoneId" UUID,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "actorUserId" UUID,
    "reason" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_price_snapshots" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "pricingJson" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_counters" (
    "tenantId" UUID NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "booking_counters_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "booking_holds" ADD COLUMN "bookingId" UUID;

CREATE UNIQUE INDEX "bookings_tenantId_bookingNumber_key" ON "bookings"("tenantId", "bookingNumber");
CREATE INDEX "bookings_tenantId_createdAt_idx" ON "bookings"("tenantId", "createdAt");
CREATE INDEX "bookings_assignedVehicleId_idx" ON "bookings"("assignedVehicleId");
CREATE INDEX "bookings_requestedCategoryId_idx" ON "bookings"("requestedCategoryId");
CREATE INDEX "booking_status_history_bookingId_createdAt_idx" ON "booking_status_history"("bookingId", "createdAt");
CREATE INDEX "booking_price_snapshots_bookingId_idx" ON "booking_price_snapshots"("bookingId");
CREATE INDEX "booking_holds_bookingId_idx" ON "booking_holds"("bookingId");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requestedCategoryId_fkey" FOREIGN KEY ("requestedCategoryId") REFERENCES "vehicle_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assignedVehicleId_fkey" FOREIGN KEY ("assignedVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickupBranchId_fkey" FOREIGN KEY ("pickupBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_returnBranchId_fkey" FOREIGN KEY ("returnBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_price_snapshots" ADD CONSTRAINT "booking_price_snapshots_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_counters" ADD CONSTRAINT "booking_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
