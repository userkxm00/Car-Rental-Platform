-- 07-A: customer identity & profile — tenant-scoped customer master and
-- documents (07-A01/07-A04), plus the user-scoped marketplace signals:
-- favorites (07-A05), recently viewed (07-A06) and search history (07-A07).
--
-- Policy-driven uniqueness (architecture/database-schema-v1.md §5.1): the
-- same person may legitimately exist in multiple tenants, so the only
-- uniqueness rules are the account linkage (one linked platform user per
-- tenant) and one document record per type per customer.

CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

CREATE TYPE "CustomerDocumentType" AS ENUM ('DRIVER_LICENSE', 'NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'OTHER');

CREATE TYPE "CustomerDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- Tenant-scoped customer record. `userId` is the marketplace-account link
-- (07-A02); NULL keeps the row unlinked (walk-in/agency-created records).
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "dateOfBirth" DATE,
    "licenseNumber" TEXT,
    "licenseCountry" TEXT,
    "licenseIssueDate" DATE,
    "licenseExpiryDate" DATE,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- Identity/eligibility document evidence. One row per (customer, type):
-- re-issuing a document updates the row in place and resets verification.
-- `mediaObjectId` is a plain reference until media_objects storage lands.
CREATE TABLE "customer_documents" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "CustomerDocumentType" NOT NULL,
    "number" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "status" "CustomerDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "mediaObjectId" UUID,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" UUID,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_favorites" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recently_viewed_vehicles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_history" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- One marketplace-account link per tenant; multiple NULL rows are allowed
-- (PostgreSQL treats NULLs as distinct in unique indexes).
CREATE UNIQUE INDEX "customers_tenantId_userId_key" ON "customers"("tenantId", "userId");
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");
CREATE INDEX "customers_userId_idx" ON "customers"("userId");

CREATE UNIQUE INDEX "customer_documents_customerId_type_key" ON "customer_documents"("customerId", "type");
CREATE INDEX "customer_documents_customerId_idx" ON "customer_documents"("customerId");

CREATE UNIQUE INDEX "customer_favorites_userId_vehicleId_key" ON "customer_favorites"("userId", "vehicleId");
CREATE INDEX "customer_favorites_userId_idx" ON "customer_favorites"("userId");

CREATE UNIQUE INDEX "recently_viewed_vehicles_userId_vehicleId_key" ON "recently_viewed_vehicles"("userId", "vehicleId");
CREATE INDEX "recently_viewed_vehicles_userId_viewedAt_idx" ON "recently_viewed_vehicles"("userId", "viewedAt");

CREATE INDEX "search_history_userId_createdAt_idx" ON "search_history"("userId", "createdAt");

ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recently_viewed_vehicles" ADD CONSTRAINT "recently_viewed_vehicles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recently_viewed_vehicles" ADD CONSTRAINT "recently_viewed_vehicles_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "search_history" ADD CONSTRAINT "search_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
