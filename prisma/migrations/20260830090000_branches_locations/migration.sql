
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

CREATE TYPE "LocationType" AS ENUM ('BRANCH', 'AIRPORT', 'HOTEL', 'PARKING', 'PICKUP_POINT', 'CUSTOM');

CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "type" "LocationType" NOT NULL DEFAULT 'CUSTOM',
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'DZ',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "providerName" TEXT,
    "providerPlaceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT,
    "contacts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_hours" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_hours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_hour_exceptions" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_hour_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "feePolicyReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "locations_tenantId_idx" ON "locations"("tenantId");

CREATE INDEX "branches_locationId_idx" ON "branches"("locationId");

CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

CREATE UNIQUE INDEX "location_hours_locationId_dayOfWeek_key" ON "location_hours"("locationId", "dayOfWeek");

CREATE UNIQUE INDEX "location_hour_exceptions_locationId_date_key" ON "location_hour_exceptions"("locationId", "date");

CREATE INDEX "delivery_zones_tenantId_idx" ON "delivery_zones"("tenantId");

ALTER TABLE "locations" ADD CONSTRAINT "locations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branches" ADD CONSTRAINT "branches_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_hours" ADD CONSTRAINT "location_hours_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "location_hour_exceptions" ADD CONSTRAINT "location_hour_exceptions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
