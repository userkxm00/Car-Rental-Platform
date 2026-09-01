/**
 * PHASE-06 / 06-C: commercial-adjustment calculation — pure, deterministic,
 * integer-safe. R1 stacking policy (docs/06, architecture/pricing-engine.md):
 * a valid customer coupon wins over promotions; promotions do not stack —
 * the single best promotion applies.
 */

export const CommercialDiscountType = {
  PERCENT: 'PERCENT',
  FIXED_MINOR: 'FIXED_MINOR',
} as const;
export type CommercialDiscountTypeValue =
  (typeof CommercialDiscountType)[keyof typeof CommercialDiscountType];

export const FeeRuleKind = {
  DELIVERY_FEE: 'DELIVERY_FEE',
  DISTANCE_FEE: 'DISTANCE_FEE',
  ONE_WAY_FEE: 'ONE_WAY_FEE',
  AFTER_HOURS_FEE: 'AFTER_HOURS_FEE',
} as const;
export type FeeRuleKindValue = (typeof FeeRuleKind)[keyof typeof FeeRuleKind];

export const DepositPolicyType = {
  FIXED_MINOR: 'FIXED_MINOR',
  PERCENT_OF_TOTAL: 'PERCENT_OF_TOTAL',
} as const;
export type DepositPolicyTypeValue =
  (typeof DepositPolicyType)[keyof typeof DepositPolicyType];

export const EXTRA_TYPES = [
  'ADDITIONAL_DRIVER',
  'CHILD_SEAT',
  'GPS_DEVICE',
  'INSURANCE_OPTION',
  'ADDITIONAL_MILEAGE',
  'FUEL_CHARGE',
  'LATE_RETURN_CHARGE',
  'DELIVERY_SERVICE',
  'OTHER',
] as const;
export const EXTRA_PRICING_UNITS = ['PER_BOOKING', 'PER_DAY', 'PER_RENTAL_UNIT'] as const;
export type ExtraPricingUnitValue = (typeof EXTRA_PRICING_UNITS)[number];

export const MAX_DISCOUNT_MINOR = 1_000_000_000;
export const MAX_DISCOUNT_BASIS_POINTS = 1_000_000;
export const MAX_EXTRA_AMOUNT_MINOR = 1_000_000_000;
export const MAX_REDEMPTIONS = 10_000_000;
export const MAX_SCOPE_ROWS = 50;

export interface PromotionCandidate {
  id: string;
  code: string;
  discountType: CommercialDiscountTypeValue;
  valueMinor: number;
  minDurationUnits: number | null;
  durationUnit: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  active: boolean;
  createdAt: Date;
  scopes: Array<{
    vehicleId: string | null;
    categoryId: string | null;
    branchId: string | null;
  }>;
}

export interface CouponCandidate {
  id: string;
  code: string;
  discountType: CommercialDiscountTypeValue;
  valueMinor: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
}

export interface DepositPolicyCandidate {
  id: string;
  depositType: DepositPolicyTypeValue;
  valueMinor: number;
  active: boolean;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
}

export interface CommercialContext {
  now: Date;
  vehicleId: string | null;
  categoryId: string | null;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
  /** Billable duration units for the duration requirement (06-C09). */
  durationUnits: number;
  durationUnit: string | null;
}

/** Discount amount for a base minor amount (PERCENT = basis points). */
export function discountMinor(
  baseMinor: number,
  discountType: CommercialDiscountTypeValue,
  valueMinor: number,
): number {
  if (discountType === 'FIXED_MINOR') {
    return Math.min(valueMinor, baseMinor);
  }
  return Math.min(Math.round((baseMinor * valueMinor) / 10_000), baseMinor);
}

/** Half-open promotion window + activity + redemption cap. */
export function isPromotionEligible(
  promotion: PromotionCandidate,
  context: CommercialContext,
): boolean {
  if (!promotion.active) {
    return false;
  }
  if (promotion.effectiveFrom.getTime() > context.now.getTime()) {
    return false;
  }
  if (promotion.effectiveUntil !== null && promotion.effectiveUntil.getTime() <= context.now.getTime()) {
    return false;
  }
  if (
    promotion.maxRedemptions !== null &&
    promotion.redemptionsCount >= promotion.maxRedemptions
  ) {
    return false;
  }
  if (
    promotion.minDurationUnits !== null &&
    (context.durationUnit === null ||
      context.durationUnit !== promotion.durationUnit ||
      context.durationUnits < promotion.minDurationUnits)
  ) {
    return false;
  }
  return scopeMatches(
    promotion.scopes,
    context.vehicleId,
    context.categoryId,
    context.pickupBranchId,
  );
}

/**
 * Scope eligibility (06-C09): a promotion without scopes is tenant-wide;
 * with scopes, the context must match at least one row on every populated
 * dimension of that row (vehicle OR category OR branch).
 */
export function scopeMatches(
  scopes: Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }>,
  vehicleId: string | null,
  categoryId: string | null,
  pickupBranchId: string | null,
): boolean {
  if (scopes.length === 0) {
    return true;
  }
  return scopes.some(
    (scope) =>
      (scope.vehicleId === null || scope.vehicleId === vehicleId) &&
      (scope.categoryId === null || scope.categoryId === categoryId) &&
      (scope.branchId === null || scope.branchId === pickupBranchId) &&
      (scope.vehicleId !== null || scope.categoryId !== null || scope.branchId !== null),
  );
}

/**
 * Selects the single winning promotion for a base amount. Deterministic
 * order: largest computed discount, then FIXED over PERCENT, then the
 * earliest createdAt, then id — the same inputs always pick the same
 * promotion.
 */
export function selectPromotion(
  candidates: PromotionCandidate[],
  baseMinor: number,
  context: CommercialContext,
): { promotion: PromotionCandidate; amountMinor: number } | null {
  const eligible = candidates
    .filter((candidate) => isPromotionEligible(candidate, context))
    .map((candidate) => ({
      promotion: candidate,
      amountMinor: discountMinor(baseMinor, candidate.discountType, candidate.valueMinor),
    }))
    .sort((a, b) => {
      if (b.amountMinor !== a.amountMinor) {
        return b.amountMinor - a.amountMinor;
      }
      const aFixed = a.promotion.discountType === 'FIXED_MINOR' ? 0 : 1;
      const bFixed = b.promotion.discountType === 'FIXED_MINOR' ? 0 : 1;
      if (aFixed !== bFixed) {
        return aFixed - bFixed;
      }
      if (a.promotion.createdAt.getTime() !== b.promotion.createdAt.getTime()) {
        return a.promotion.createdAt.getTime() - b.promotion.createdAt.getTime();
      }
      return a.promotion.id < b.promotion.id ? -1 : 1;
    });
  return eligible[0] ?? null;
}

/** Coupon usability at `now`: window, activity, usage cap. */
export function isCouponUsable(coupon: CouponCandidate, now: Date): boolean {
  if (!coupon.active) {
    return false;
  }
  if (coupon.effectiveFrom.getTime() > now.getTime()) {
    return false;
  }
  if (coupon.effectiveUntil !== null && coupon.effectiveUntil.getTime() <= now.getTime()) {
    return false;
  }
  return coupon.maxUses === null || coupon.usedCount < coupon.maxUses;
}

/** Straight-line distance (R1; PostGIS polygons arrive with 02-C08). */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Whether a local instant falls outside the location hours for its weekday. */
export function isAfterHours(
  instant: Date,
  timezone: string,
  hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>,
): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));

  const todaysHours = hours.filter((row) => row.dayOfWeek === dayIndex);
  if (todaysHours.length === 0) {
    // No configured hours for this day: never after-hours.
    return false;
  }
  const toMinutes = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  return todaysHours.some((row) => {
    const opens = toMinutes(row.opensAt);
    const closes = toMinutes(row.closesAt);
    if (opens === closes) {
      return false; // closed day guard: no opening window at all
    }
    if (closes > opens) {
      return minutes < opens || minutes >= closes;
    }
    return minutes < opens && minutes >= closes; // overnight window
  });
}

/** Highest-specificity deposit policy: vehicle > category > global. */
export function selectDepositPolicy(
  policies: DepositPolicyCandidate[],
  vehicleId: string | null,
  categoryId: string | null,
): DepositPolicyCandidate | null {
  const active = policies.filter((policy) => policy.active);
  const scored = active
    .map((policy) => {
      let score = 0;
      const hasScopes = policy.scopes.length > 0;
      if (!hasScopes) {
        score = 1;
      }
      for (const scope of policy.scopes) {
        if (scope.vehicleId !== null && scope.vehicleId === vehicleId && score < 3) {
          score = 3;
        }
        if (scope.categoryId !== null && scope.categoryId === categoryId && score < 2) {
          score = 2;
        }
      }
      return { policy, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.policy ?? null;
}

/** Deposit amount for a quote total (PERCENT_OF_TOTAL = basis points). */
export function depositAmountMinor(
  policy: DepositPolicyCandidate,
  totalMinor: number,
): number {
  if (policy.depositType === 'FIXED_MINOR') {
    return policy.valueMinor;
  }
  return Math.round((totalMinor * policy.valueMinor) / 10_000);
}
