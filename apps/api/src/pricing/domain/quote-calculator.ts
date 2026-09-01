/**
 * PHASE-06 / 06-D05: the financial-truth calculator — one pure,
 * deterministic function that composes every implemented pricing layer
 * in the pipeline order (architecture/pricing-engine.md):
 *
 *   rate plan (06-A06) → duration ladder + time adjustments (06-B)
 *   → promotion/coupon (06-C01/02/09) → extras (06-C03)
 *   → context fees (06-C04…C07) → deposit (06-C08) → rounding (06-D02).
 *
 * Identical inputs always produce identical integer-minor totals; the
 * engine provider (06-D06) feeds it tenant-scoped rows and maps the
 * result onto the quote pricing payload. Coupons and extras are optional
 * inputs — the R1 quote flow passes none (they are consumed by
 * booking/payment flows that carry codes and selections).
 */

import {
  depositAmountMinor,
  discountMinor,
  haversineDistanceKm,
  isAfterHours,
  isCouponUsable,
  selectDepositPolicy,
  selectPromotion,
  type CouponCandidate,
  type DepositPolicyCandidate,
  type ExtraPricingUnitValue,
  type PromotionCandidate,
} from './commercial-rules';
import {
  compareRatePlanCandidates,
  isRatePlanEffective,
  type RatePlanCandidate,
} from './rate-plan-selection';
import {
  applyTimeAdjustments,
  baseAmountForDuration,
  durationUnitsInInterval,
  type RatePlanTierRule,
  type TimeAdjustmentRule,
} from './time-rules';
import { roundToCurrencyMinor } from './money';

/** Stable business signal: no active rate plan applies to the target. */
export class NoPricingConfigurationError extends Error {
  constructor() {
    super('No active rate plan applies to this quote.');
    this.name = 'NoPricingConfigurationError';
  }
}

export interface QuotePlanInput {
  id: string;
  code: string;
  name: string;
  currency: string;
  durationUnit: string;
  baseRateMinor: number;
  precedence: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
  createdAt: Date;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
  tiers: RatePlanTierRule[];
  adjustments: TimeAdjustmentRule[];
}

/** Branch context: timezone override, coordinates and location hours. */
export interface BranchPointInput {
  branchId: string;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
}

export interface FeeRuleInput {
  id: string;
  kind: string;
  deliveryZoneId: string | null;
  branchId: string | null;
  baseMinor: number;
  perKmMinor: number | null;
  perOccurrenceMinor: number | null;
  active: boolean;
  createdAt: Date;
}

/** Client-picked extra (catalog amount + requested quantity only). */
export interface ExtraSelectionInput {
  key: string;
  pricingUnit: ExtraPricingUnitValue;
  amountMinor: number;
  quantity: number;
}

export interface QuoteCalculationInput {
  now: Date;
  start: Date;
  end: Date;
  vehicleId: string | null;
  categoryId: string | null;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
  pickupBranch: BranchPointInput | null;
  returnBranch: BranchPointInput | null;
  /** Tenant IANA timezone (Africa/Algiers for R1); branch override wins. */
  tenantTimezone: string;
  plans: QuotePlanInput[];
  promotions: PromotionCandidate[];
  feeRules: FeeRuleInput[];
  depositPolicies: DepositPolicyCandidate[];
  /** Optional customer coupon; when usable it wins over promotions. */
  coupon?: CouponCandidate | null;
  /** Optional extras selections (R1 quote flow passes none). */
  extraSelections?: ExtraSelectionInput[];
}

export interface QuoteBreakdownLine {
  code: string;
  amountMinor: number;
}

export interface QuoteCalculationResult {
  planId: string;
  planCode: string;
  currency: string;
  durationUnit: string;
  durationUnits: number;
  /** Itemized signed components of the total (no deposit). */
  lines: QuoteBreakdownLine[];
  totalMinor: number;
  depositMinor: number | null;
  appliedPromotionCode: string | null;
  appliedCouponCode: string | null;
}

/**
 * 06-A06 scope mapping: a plan without scopes is tenant-global; with
 * scopes it applies to the target when a row matches the vehicle, else
 * the category; otherwise the plan does not apply at all.
 */
export function ratePlanCandidateForTarget(
  plan: QuotePlanInput,
  vehicleId: string | null,
  categoryId: string | null,
): RatePlanCandidate | null {
  if (plan.scopes.length === 0) {
    return {
      id: plan.id,
      currency: plan.currency,
      durationUnit: plan.durationUnit,
      baseRateMinor: plan.baseRateMinor,
      precedence: plan.precedence,
      effectiveFrom: plan.effectiveFrom,
      effectiveUntil: plan.effectiveUntil,
      active: plan.active,
      createdAt: plan.createdAt,
      scopeKind: 'GLOBAL',
    };
  }
  if (vehicleId !== null && plan.scopes.some((scope) => scope.vehicleId === vehicleId)) {
    return {
      id: plan.id,
      currency: plan.currency,
      durationUnit: plan.durationUnit,
      baseRateMinor: plan.baseRateMinor,
      precedence: plan.precedence,
      effectiveFrom: plan.effectiveFrom,
      effectiveUntil: plan.effectiveUntil,
      active: plan.active,
      createdAt: plan.createdAt,
      scopeKind: 'VEHICLE',
      vehicleId,
    };
  }
  if (categoryId !== null && plan.scopes.some((scope) => scope.categoryId === categoryId)) {
    return {
      id: plan.id,
      currency: plan.currency,
      durationUnit: plan.durationUnit,
      baseRateMinor: plan.baseRateMinor,
      precedence: plan.precedence,
      effectiveFrom: plan.effectiveFrom,
      effectiveUntil: plan.effectiveUntil,
      active: plan.active,
      createdAt: plan.createdAt,
      scopeKind: 'CATEGORY',
      categoryId,
    };
  }
  return null;
}

/** Deterministic single-rule pick: earliest createdAt, then id. */
function pickRule<T extends { createdAt: Date; id: string }>(rules: T[]): T | null {
  if (rules.length === 0) {
    return null;
  }
  return [...rules].sort((a, b) => {
    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    return a.id < b.id ? -1 : 1;
  })[0];
}

/** Straight-line branch-to-branch distance; 0 without coordinates (R1). */
function branchDistanceKm(a: BranchPointInput | null, b: BranchPointInput | null): number {
  if (
    !a ||
    !b ||
    a.latitude === null ||
    a.longitude === null ||
    b.latitude === null ||
    b.longitude === null
  ) {
    return 0;
  }
  return haversineDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
}

function branchTimezone(branch: BranchPointInput | null, tenantTimezone: string): string {
  return branch?.timezone ?? tenantTimezone;
}

/** 06-C07: one occurrence per out-of-hours pickup/return instant. */
function afterHoursOccurrences(
  start: Date,
  end: Date,
  pickup: BranchPointInput | null,
  returnBranch: BranchPointInput | null,
  tenantTimezone: string,
): number {
  let occurrences = 0;
  if (pickup && isAfterHours(start, branchTimezone(pickup, tenantTimezone), pickup.hours)) {
    occurrences += 1;
  }
  if (
    returnBranch &&
    !(pickup && pickup.branchId === returnBranch.branchId) &&
    isAfterHours(end, branchTimezone(returnBranch, tenantTimezone), returnBranch.hours)
  ) {
    occurrences += 1;
  }
  return occurrences;
}

/** 06-C03: catalog amount × quantity in the extra's own pricing unit. */
function extraAmountMinor(
  selection: ExtraSelectionInput,
  interval: { start: Date; end: Date },
  planUnitCount: number,
): number {
  const quantity = Math.max(0, Math.floor(selection.quantity));
  if (quantity === 0) {
    return 0;
  }
  switch (selection.pricingUnit) {
    case 'PER_BOOKING':
      return selection.amountMinor * quantity;
    case 'PER_DAY':
      return selection.amountMinor * quantity * durationUnitsInInterval('DAILY', interval);
    case 'PER_RENTAL_UNIT':
      return selection.amountMinor * quantity * planUnitCount;
    default:
      return 0;
  }
}

/**
 * The whole quote calculation. Throws {@link NoPricingConfigurationError}
 * when no plan applies; otherwise returns the itemized, rounded total and
 * the separate deposit requirement.
 */
export function calculateQuote(input: QuoteCalculationInput): QuoteCalculationResult {
  const { now, start, end } = input;

  // 1. Deterministic rate-plan selection (06-A06).
  const candidates = input.plans
    .map((plan) => ratePlanCandidateForTarget(plan, input.vehicleId, input.categoryId))
    .filter((candidate): candidate is RatePlanCandidate => candidate !== null)
    .filter((candidate) => isRatePlanEffective(candidate, now))
    .sort(compareRatePlanCandidates);
  const selected = candidates[0];
  if (!selected) {
    throw new NoPricingConfigurationError();
  }
  const plan = input.plans.find((candidate) => candidate.id === selected.id);
  if (!plan) {
    throw new NoPricingConfigurationError();
  }

  const lines: QuoteBreakdownLine[] = [];

  // 2. Duration ladder (06-B05) on the plan's duration unit — the
  // RENTAL line itemizes it (transparency: the breakdown always lists
  // every component of the total).
  const unitCount = durationUnitsInInterval(plan.durationUnit, { start, end });
  const ladderMinor = baseAmountForDuration(unitCount, plan.baseRateMinor, plan.tiers);
  lines.push({ code: 'RENTAL', amountMinor: ladderMinor });

  // 3. Time adjustments (06-B06…B08) — per-unit rules computed against
  // the plan base rate. R1: the holiday-weekend fast path stays off
  // until a tenant-level switch exists; configured HOLIDAY rules apply.
  const adjustments = applyTimeAdjustments(
    { start, end },
    plan.durationUnit,
    plan.baseRateMinor,
    plan.adjustments,
    { timezone: input.tenantTimezone, holidayWeekendFastPath: false },
  );
  const adjustmentTotal = adjustments.lines.reduce((sum, line) => sum + line.amountMinor, 0);
  for (const line of adjustments.lines) {
    if (line.amountMinor !== 0) {
      lines.push({ code: `TIME_${line.kind}`, amountMinor: line.amountMinor });
    }
  }
  const rentalMinor = ladderMinor + adjustmentTotal;

  // 4. Promotion or coupon (06-C01/02/09). A usable customer coupon
  // wins over promotions; promotions themselves do not stack.
  const context = {
    now,
    vehicleId: input.vehicleId,
    categoryId: input.categoryId,
    pickupBranchId: input.pickupBranchId,
    returnBranchId: input.returnBranchId,
    deliveryZoneId: input.deliveryZoneId,
    durationUnits: unitCount,
    durationUnit: plan.durationUnit,
  };
  let appliedPromotionCode: string | null = null;
  let appliedCouponCode: string | null = null;
  let discountMinorTotal = 0;
  const coupon = input.coupon ?? null;
  if (coupon && isCouponUsable(coupon, now)) {
    appliedCouponCode = coupon.code;
    discountMinorTotal = discountMinor(rentalMinor, coupon.discountType, coupon.valueMinor);
  } else {
    const promotion = selectPromotion(input.promotions, rentalMinor, context);
    if (promotion) {
      appliedPromotionCode = promotion.promotion.code;
      discountMinorTotal = promotion.amountMinor;
    }
  }
  if (discountMinorTotal > 0) {
    lines.push({
      code: appliedCouponCode !== null ? 'COUPON_DISCOUNT' : 'PROMOTION_DISCOUNT',
      amountMinor: -discountMinorTotal,
    });
  }

  // 5. Extras (06-C03): catalog amounts only; the client never submits
  // an amount — only keys/quantities (R1 quote flow passes none).
  for (const selection of input.extraSelections ?? []) {
    const amount = extraAmountMinor(selection, { start, end }, unitCount);
    if (amount !== 0) {
      lines.push({ code: `EXTRA_${selection.key}`, amountMinor: amount });
    }
  }

  // 6. Context fees (06-C04…C07).
  const km = branchDistanceKm(input.pickupBranch, input.returnBranch);
  const zoneRules = input.feeRules.filter(
    (rule) => rule.active && rule.deliveryZoneId !== null && rule.deliveryZoneId === input.deliveryZoneId,
  );
  const deliveryRule = pickRule(zoneRules.filter((rule) => rule.kind === 'DELIVERY_FEE'));
  if (deliveryRule) {
    const amount =
      deliveryRule.baseMinor +
      (deliveryRule.perOccurrenceMinor ?? 0) +
      Math.round(km * (deliveryRule.perKmMinor ?? 0));
    if (amount > 0) {
      lines.push({ code: 'DELIVERY_FEE', amountMinor: amount });
    }
  }
  const distanceRule = pickRule(zoneRules.filter((rule) => rule.kind === 'DISTANCE_FEE'));
  if (distanceRule && distanceRule.perKmMinor !== null) {
    const amount = Math.round(km * distanceRule.perKmMinor);
    if (amount > 0) {
      lines.push({ code: 'DISTANCE_FEE', amountMinor: amount });
    }
  }
  if (
    input.pickupBranchId !== null &&
    input.returnBranchId !== null &&
    input.pickupBranchId !== input.returnBranchId
  ) {
    const oneWayRule = pickRule(input.feeRules.filter((rule) => rule.active && rule.kind === 'ONE_WAY_FEE'));
    if (oneWayRule && oneWayRule.baseMinor > 0) {
      lines.push({ code: 'ONE_WAY_FEE', amountMinor: oneWayRule.baseMinor });
    }
  }
  const afterHoursRules = input.feeRules.filter(
    (rule) =>
      rule.active &&
      rule.kind === 'AFTER_HOURS_FEE' &&
      (rule.branchId === null || rule.branchId === input.pickupBranchId),
  );
  const afterHoursRule = pickRule(afterHoursRules);
  if (afterHoursRule && afterHoursRule.perOccurrenceMinor !== null) {
    const occurrences = afterHoursOccurrences(
      start,
      end,
      input.pickupBranch,
      input.returnBranch,
      input.tenantTimezone,
    );
    const amount = occurrences * afterHoursRule.perOccurrenceMinor;
    if (amount > 0) {
      lines.push({ code: 'AFTER_HOURS_FEE', amountMinor: amount });
    }
  }

  // 7. Total (never negative) rounded once to the currency precision.
  // A rounding-adjustment line keeps the itemized breakdown
  // reconcilable: the lines always sum exactly to the total (06-D02).
  const linesTotal = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const totalMinor = roundToCurrencyMinor(Math.max(0, linesTotal), plan.currency);
  const roundingDelta = totalMinor - linesTotal;
  if (roundingDelta !== 0) {
    lines.push({ code: 'ROUNDING_ADJUSTMENT', amountMinor: roundingDelta });
  }

  // 8. Deposit (06-C08): separate from the total, vehicle > category > global.
  const policy = selectDepositPolicy(input.depositPolicies, input.vehicleId, input.categoryId);
  const depositMinor = policy ? depositAmountMinor(policy, totalMinor) : null;

  return {
    planId: plan.id,
    planCode: plan.code,
    currency: plan.currency,
    durationUnit: plan.durationUnit,
    durationUnits: unitCount,
    lines,
    totalMinor,
    depositMinor,
    appliedPromotionCode,
    appliedCouponCode,
  };
}
