-- 05-A: persisted quote records — immutable request context plus the
-- server-computed availability answer and pricing slot captured at creation
-- time (architecture/database-schema-v1.md §8 quote_records). Pricing is
-- null until the pricing engine (PHASE-06) registers a provider.

CREATE TYPE "QuoteInventoryMode" AS ENUM ('VEHICLE', 'CATEGORY');

CREATE TABLE "quote_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" "BookingChannel" NOT NULL,
    "inventoryMode" "QuoteInventoryMode" NOT NULL,
    "vehicleId" UUID,
    "categoryId" UUID,
    "pickupBranchId" UUID,
    "returnBranchId" UUID,
    "deliveryZoneId" UUID,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "availabilityJson" JSONB NOT NULL,
    "pricingJson" JSONB,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_records_tenantId_createdAt_idx" ON "quote_records"("tenantId", "createdAt");

ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_pickupBranchId_fkey" FOREIGN KEY ("pickupBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_returnBranchId_fkey" FOREIGN KEY ("returnBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_records" ADD CONSTRAINT "quote_records_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
