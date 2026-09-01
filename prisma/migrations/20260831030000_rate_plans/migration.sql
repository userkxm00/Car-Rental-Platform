-- PHASE-06 / 06-A: rate plans — tenant pricing configuration (06-A01),
-- integer minor-unit money (06-A02/A03), effective windows (06-A03),
-- vehicle/category applicability (06-A04), duration units (06-A05) and
-- the precedence column consumed by the deterministic domain ordering
-- (06-A06). Calculation/snapshots land with 06-B/06-D.

CREATE TYPE "RateDurationUnit" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

CREATE TABLE "rate_plans" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "durationUnit" "RateDurationUnit" NOT NULL,
    "baseRateMinor" INTEGER NOT NULL,
    "precedence" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_plan_scopes" (
    "id" UUID NOT NULL,
    "ratePlanId" UUID NOT NULL,
    "vehicleId" UUID,
    "categoryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_plan_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_plans_tenantId_code_key" ON "rate_plans"("tenantId", "code");

CREATE INDEX "rate_plans_tenantId_active_idx" ON "rate_plans"("tenantId", "active");

CREATE INDEX "rate_plan_scopes_vehicleId_idx" ON "rate_plan_scopes"("vehicleId");

CREATE INDEX "rate_plan_scopes_categoryId_idx" ON "rate_plan_scopes"("categoryId");

ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_plan_scopes" ADD CONSTRAINT "rate_plan_scopes_ratePlanId_fkey"
    FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_plan_scopes" ADD CONSTRAINT "rate_plan_scopes_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_plan_scopes" ADD CONSTRAINT "rate_plan_scopes_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
