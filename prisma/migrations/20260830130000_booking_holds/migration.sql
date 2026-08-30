CREATE TYPE "BookingChannel" AS ENUM ('MARKETPLACE', 'AGENCY_WEB', 'STAFF', 'PHONE', 'WALK_IN', 'IMPORT');

CREATE TYPE "BookingHoldStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'RELEASED', 'CONSUMED');

CREATE TABLE "booking_holds" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "vehicleId" UUID,
    "categoryId" UUID,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "channel" "BookingChannel" NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_holds_tenantId_idx" ON "booking_holds"("tenantId");

CREATE INDEX "booking_holds_vehicleId_startsAt_endsAt_idx" ON "booking_holds"("vehicleId", "startsAt", "endsAt");

CREATE INDEX "booking_holds_expiresAt_idx" ON "booking_holds"("expiresAt");

ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
