-- 02-A01: Agency/Tenant migration.
-- Generated with the Prisma schema engine (offline, `migrate diff --from-empty
-- --to-schema-datamodel`), trimmed to the tables introduced by this migration.
-- Authority: architecture/database-schema-v1.md §2 (tenants).

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TenantVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "slug" TEXT NOT NULL,
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "defaultTimezone" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'DZD',
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "marketplaceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "TenantVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
