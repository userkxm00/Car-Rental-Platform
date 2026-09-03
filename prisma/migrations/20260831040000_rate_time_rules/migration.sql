-- PHASE-06 / 06-B: time rules — duration tiers (06-B05) and date/season
-- adjustments (06-B06..B08) on top of the 06-A rate model. Percent values
-- are basis points and money stays integer minor units. Calculation semantics
-- live in the pricing domain (apps/api/src/pricing/domain/time-rules.ts).

CREATE TYPE "RateAdjustmentKind" AS ENUM ('SEASONAL', 'SPECIAL_DATE', 'WEEKEND', 'HOLIDAY');

CREATE TYPE "RateAdjustmentType" AS ENUM ('PERCENT', 'FLAT_PER_UNIT');

CREATE TABLE "rate_plan_tiers" (
    "id" UUID NOT NULL,
    "ratePlanId" UUID NOT NULL,
    "upToUnits" INTEGER,
    "rateMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_plan_tiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_plan_adjustments" (
    "id" UUID NOT NULL,
    "ratePlanId" UUID NOT NULL,
    "kind" "RateAdjustmentKind" NOT NULL,
    "adjustmentType" "RateAdjustmentType" NOT NULL,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "date" DATE,
    "daysOfWeek" INTEGER[],
    "valueMinor" INTEGER NOT NULL,
    "precedence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_plan_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rate_plan_tiers_ratePlanId_idx" ON "rate_plan_tiers"("ratePlanId");

CREATE INDEX "rate_plan_adjustments_ratePlanId_idx" ON "rate_plan_adjustments"("ratePlanId");

CREATE UNIQUE INDEX "rate_plan_adjustments_ratePlanId_kind_precedence_key"
    ON "rate_plan_adjustments"("ratePlanId", "kind", "precedence");

-- At most one open tier per plan (enforced again at the application
-- boundary - this is the database backstop).
CREATE UNIQUE INDEX "rate_plan_tiers_open_unique"
    ON "rate_plan_tiers"("ratePlanId")
    WHERE "upToUnits" IS NULL;

ALTER TABLE "rate_plan_tiers" ADD CONSTRAINT "rate_plan_tiers_ratePlanId_fkey"
    FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rate_plan_adjustments" ADD CONSTRAINT "rate_plan_adjustments_ratePlanId_fkey"
    FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
