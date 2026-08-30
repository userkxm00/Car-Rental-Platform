CREATE TYPE "VehicleBlockType" AS ENUM ('MAINTENANCE', 'INSPECTION', 'DAMAGE', 'TRANSFER', 'MANUAL', 'CLEANING', 'OTHER');

CREATE TYPE "VehicleBlockStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "vehicle_blocks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "blockType" "VehicleBlockType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "VehicleBlockStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_blocks_tenantId_idx" ON "vehicle_blocks"("tenantId");

CREATE INDEX "vehicle_blocks_vehicleId_startsAt_endsAt_idx" ON "vehicle_blocks"("vehicleId", "startsAt", "endsAt");

ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
