CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', 'INSPECTION', 'ARCHIVED');

CREATE TABLE "vehicle_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameFr" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "descriptionAr" TEXT,
    "descriptionFr" TEXT,
    "transmission" TEXT,
    "fuelType" TEXT,
    "seats" INTEGER,
    "doors" INTEGER,
    "luggageCapacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicle_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "category_features" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "featureKey" TEXT NOT NULL,
    CONSTRAINT "category_features_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "currentBranchId" UUID,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "vin" TEXT,
    "color" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "acquisitionDate" DATE,
    "acquisitionCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "odometer_readings" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "odometerKm" INTEGER NOT NULL,
    "fuelLevelPercent" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "odometer_readings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_categories_tenantId_idx" ON "vehicle_categories"("tenantId");

CREATE UNIQUE INDEX "vehicle_categories_tenantId_code_key" ON "vehicle_categories"("tenantId", "code");

CREATE UNIQUE INDEX "category_features_categoryId_featureKey_key" ON "category_features"("categoryId", "featureKey");

CREATE INDEX "vehicles_tenantId_idx" ON "vehicles"("tenantId");

CREATE INDEX "vehicles_categoryId_idx" ON "vehicles"("categoryId");

CREATE INDEX "vehicles_currentBranchId_idx" ON "vehicles"("currentBranchId");

CREATE UNIQUE INDEX "vehicles_tenantId_plateNumber_key" ON "vehicles"("tenantId", "plateNumber");

CREATE INDEX "odometer_readings_vehicleId_recordedAt_idx" ON "odometer_readings"("vehicleId", "recordedAt");

ALTER TABLE "vehicle_categories" ADD CONSTRAINT "vehicle_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_features" ADD CONSTRAINT "category_features_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "odometer_readings" ADD CONSTRAINT "odometer_readings_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
