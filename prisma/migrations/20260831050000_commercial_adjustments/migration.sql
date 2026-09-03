-- PHASE-06 / 06-C: commercial adjustments — promotions (06-C01) with
-- eligibility scopes (06-C09), coupons (06-C02), typed extras (06-C03),
-- context fee rules (06-C04..C07) and deposit pricing (06-C08). Money is
-- integer minor units and PERCENT values are basis points. Selection
-- semantics live in apps/api/src/pricing/domain/commercial-rules.ts.

CREATE TYPE "CommercialDiscountType" AS ENUM ('PERCENT', 'FIXED_MINOR');

CREATE TYPE "ExtraType" AS ENUM ('ADDITIONAL_DRIVER', 'CHILD_SEAT', 'GPS_DEVICE', 'INSURANCE_OPTION', 'ADDITIONAL_MILEAGE', 'FUEL_CHARGE', 'LATE_RETURN_CHARGE', 'DELIVERY_SERVICE', 'OTHER');

CREATE TYPE "ExtraPricingUnit" AS ENUM ('PER_BOOKING', 'PER_DAY', 'PER_RENTAL_UNIT');

CREATE TYPE "FeeRuleKind" AS ENUM ('DELIVERY_FEE', 'DISTANCE_FEE', 'ONE_WAY_FEE', 'AFTER_HOURS_FEE');

CREATE TYPE "DepositPolicyType" AS ENUM ('FIXED_MINOR', 'PERCENT_OF_TOTAL');

CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "CommercialDiscountType" NOT NULL,
    "valueMinor" INTEGER NOT NULL,
    "minDurationUnits" INTEGER,
    "durationUnit" "RateDurationUnit",
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redemptionsCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promotion_scopes" (
    "id" UUID NOT NULL,
    "promotionId" UUID NOT NULL,
    "vehicleId" UUID,
    "categoryId" UUID,
    "branchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_scopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "CommercialDiscountType" NOT NULL,
    "valueMinor" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveUntil" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "extras" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "type" "ExtraType" NOT NULL,
    "name" TEXT NOT NULL,
    "pricingUnit" "ExtraPricingUnit" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "extras_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_rules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" "FeeRuleKind" NOT NULL,
    "deliveryZoneId" UUID,
    "branchId" UUID,
    "baseMinor" INTEGER NOT NULL DEFAULT 0,
    "perKmMinor" INTEGER,
    "perOccurrenceMinor" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deposit_policies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "depositType" "DepositPolicyType" NOT NULL,
    "valueMinor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deposit_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deposit_policy_scopes" (
    "id" UUID NOT NULL,
    "depositPolicyId" UUID NOT NULL,
    "vehicleId" UUID,
    "categoryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deposit_policy_scopes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promotions_tenantId_code_key" ON "promotions"("tenantId", "code");
CREATE UNIQUE INDEX "coupons_tenantId_code_key" ON "coupons"("tenantId", "code");
CREATE UNIQUE INDEX "extras_tenantId_key_key" ON "extras"("tenantId", "key");

CREATE INDEX "promotion_scopes_promotionId_idx" ON "promotion_scopes"("promotionId");
CREATE INDEX "fee_rules_tenantId_kind_idx" ON "fee_rules"("tenantId", "kind");
CREATE INDEX "deposit_policy_scopes_depositPolicyId_idx" ON "deposit_policy_scopes"("depositPolicyId");

ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotion_scopes" ADD CONSTRAINT "promotion_scopes_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotion_scopes" ADD CONSTRAINT "promotion_scopes_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotion_scopes" ADD CONSTRAINT "promotion_scopes_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "promotion_scopes" ADD CONSTRAINT "promotion_scopes_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extras" ADD CONSTRAINT "extras_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_deliveryZoneId_fkey"
    FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deposit_policies" ADD CONSTRAINT "deposit_policies_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deposit_policy_scopes" ADD CONSTRAINT "deposit_policy_scopes_depositPolicyId_fkey"
    FOREIGN KEY ("depositPolicyId") REFERENCES "deposit_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deposit_policy_scopes" ADD CONSTRAINT "deposit_policy_scopes_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deposit_policy_scopes" ADD CONSTRAINT "deposit_policy_scopes_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
