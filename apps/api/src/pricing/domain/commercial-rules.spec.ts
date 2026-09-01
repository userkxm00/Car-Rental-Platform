import {
  depositAmountMinor,
  discountMinor,
  haversineDistanceKm,
  isAfterHours,
  isCouponUsable,
  isPromotionEligible,
  scopeMatches,
  selectDepositPolicy,
  selectPromotion,
  type CommercialContext,
  type CouponCandidate,
  type DepositPolicyCandidate,
  type PromotionCandidate,
} from './commercial-rules';

/**
 * 06-C pure calculation: stacking policy, eligibility, scopes, distance,
 * after-hours and deposit selection are deterministic functions consumed by
 * the engine — ambiguity must be impossible by construction.
 */

function context(overrides: Partial<CommercialContext> = {}): CommercialContext {
  return {
    now: new Date('2026-08-15T12:00:00Z'),
    vehicleId: null,
    categoryId: null,
    pickupBranchId: null,
    returnBranchId: null,
    deliveryZoneId: null,
    durationUnits: 3,
    durationUnit: 'DAILY',
    ...overrides,
  };
}

function promotion(overrides: Partial<PromotionCandidate> = {}): PromotionCandidate {
  return {
    id: 'promo-1',
    code: 'SUMMER10',
    discountType: 'PERCENT',
    valueMinor: 1000,
    minDurationUnits: null,
    durationUnit: null,
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    effectiveUntil: null,
    maxRedemptions: null,
    redemptionsCount: 0,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    scopes: [],
    ...overrides,
  };
}

function coupon(overrides: Partial<CouponCandidate> = {}): CouponCandidate {
  return {
    id: 'coupon-1',
    code: 'WELCOME20',
    discountType: 'PERCENT',
    valueMinor: 2000,
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    effectiveUntil: null,
    maxUses: null,
    usedCount: 0,
    active: true,
    ...overrides,
  };
}

function policy(overrides: Partial<DepositPolicyCandidate> = {}): DepositPolicyCandidate {
  return {
    id: 'dep-1',
    depositType: 'FIXED_MINOR',
    valueMinor: 50_000,
    active: true,
    scopes: [],
    ...overrides,
  };
}

describe('commercial discount math (06-C)', () => {
  it('computes PERCENT discounts as rounded basis points', () => {
    expect(discountMinor(100_000, 'PERCENT', 1000)).toBe(10_000); // 10%
    expect(discountMinor(99_999, 'PERCENT', 1000)).toBe(10_000); // rounded
    expect(discountMinor(149, 'PERCENT', 1000)).toBe(15); // round(14.9) = 15
    expect(discountMinor(140, 'PERCENT', 1000)).toBe(14); // exact
  });

  it('computes FIXED_MINOR discounts capped at the base', () => {
    expect(discountMinor(50_000, 'FIXED_MINOR', 10_000)).toBe(10_000);
    expect(discountMinor(5_000, 'FIXED_MINOR', 10_000)).toBe(5_000); // capped
  });

  it('never discounts below zero or above the base', () => {
    expect(discountMinor(100, 'PERCENT', 1_000_000)).toBe(100); // bp cap at base
    expect(discountMinor(0, 'FIXED_MINOR', 10_000)).toBe(0);
  });
});

describe('promotion eligibility (06-C01/09)', () => {
  it('rejects inactive promotions', () => {
    expect(isPromotionEligible(promotion({ active: false }), context())).toBe(false);
  });

  it('applies a half-open [effectiveFrom, effectiveUntil) window', () => {
    const atStart = context({ now: new Date('2026-08-01T00:00:00Z') });
    const atEnd = context({ now: new Date('2026-08-31T00:00:00Z') });
    const promo = promotion({
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
      effectiveUntil: new Date('2026-08-31T00:00:00Z'),
    });
    expect(isPromotionEligible(promo, atStart)).toBe(true);
    expect(isPromotionEligible(promo, atEnd)).toBe(false);
    expect(
      isPromotionEligible(promo, context({ now: new Date('2026-07-31T23:59:59Z') })),
    ).toBe(false);
  });

  it('blocks when the redemption cap is reached', () => {
    expect(
      isPromotionEligible(promotion({ maxRedemptions: 5, redemptionsCount: 5 }), context()),
    ).toBe(false);
    expect(
      isPromotionEligible(promotion({ maxRedemptions: 5, redemptionsCount: 4 }), context()),
    ).toBe(true);
  });

  it('requires minDurationUnits in the matching duration unit', () => {
    const daily = promotion({ minDurationUnits: 3, durationUnit: 'DAILY' });
    expect(isPromotionEligible(daily, context({ durationUnits: 3, durationUnit: 'DAILY' }))).toBe(true);
    expect(isPromotionEligible(daily, context({ durationUnits: 2, durationUnit: 'DAILY' }))).toBe(false);
    expect(isPromotionEligible(daily, context({ durationUnits: 3, durationUnit: 'HOURLY' }))).toBe(false);
    expect(isPromotionEligible(daily, context({ durationUnits: 3, durationUnit: null }))).toBe(false);
  });
});

describe('promotion scopes (06-C09)', () => {
  it('treats an empty scope set as tenant-wide', () => {
    expect(scopeMatches([], 'v-1', 'c-1', 'b-1')).toBe(true);
  });

  it('matches a row only when every populated dimension matches', () => {
    const scopes = [{ vehicleId: 'v-1', categoryId: null, branchId: 'b-1' }];
    expect(scopeMatches(scopes, 'v-1', 'other', 'b-1')).toBe(true);
    expect(scopeMatches(scopes, 'v-1', 'other', 'b-2')).toBe(false);
    expect(scopeMatches(scopes, 'v-2', 'other', 'b-1')).toBe(false);
  });

  it('matches any one of several rows', () => {
    const scopes = [
      { vehicleId: 'v-1', categoryId: null, branchId: null },
      { vehicleId: null, categoryId: 'c-9', branchId: null },
    ];
    expect(scopeMatches(scopes, 'v-2', 'c-9', null)).toBe(true);
    expect(scopeMatches(scopes, 'v-1', 'c-2', null)).toBe(true);
    expect(scopeMatches(scopes, 'v-2', 'c-2', null)).toBe(false);
  });

  it('ignores scopes whose populated dimensions do not apply to the context', () => {
    const scopes = [{ vehicleId: 'v-1', categoryId: null, branchId: null }];
    expect(scopeMatches(scopes, null, null, null)).toBe(false);
  });
});

describe('promotion selection (single best promotion)', () => {
  it('returns null when nothing is eligible', () => {
    expect(selectPromotion([promotion({ active: false })], 100_000, context())).toBeNull();
    expect(selectPromotion([], 100_000, context())).toBeNull();
  });

  it('selects the largest computed discount', () => {
    const percent = promotion({ id: 'pct', discountType: 'PERCENT', valueMinor: 1000 });
    const fixed = promotion({ id: 'fix', discountType: 'FIXED_MINOR', valueMinor: 25_000 });
    const winner = selectPromotion([percent, fixed], 100_000, context());
    expect(winner?.promotion.id).toBe('fix'); // 25 000 > 10 000
  });

  it('prefers FIXED_MINOR over PERCENT on equal amounts', () => {
    const percent = promotion({
      id: 'pct',
      discountType: 'PERCENT',
      valueMinor: 1000,
      createdAt: new Date('2026-08-05T00:00:00Z'),
    });
    const fixed = promotion({
      id: 'fix',
      discountType: 'FIXED_MINOR',
      valueMinor: 10_000,
      createdAt: new Date('2026-08-10T00:00:00Z'),
    });
    expect(selectPromotion([percent, fixed], 100_000, context())?.promotion.id).toBe('fix');
  });

  it('breaks remaining ties by createdAt then id', () => {
    const older = promotion({
      id: 'z-older',
      discountType: 'FIXED_MINOR',
      valueMinor: 10_000,
      createdAt: new Date('2026-08-01T00:00:00Z'),
    });
    const newer = promotion({
      id: 'a-newer',
      discountType: 'FIXED_MINOR',
      valueMinor: 10_000,
      createdAt: new Date('2026-08-02T00:00:00Z'),
    });
    expect(selectPromotion([newer, older], 100_000, context())?.promotion.id).toBe('z-older');
    const sameTime = [
      promotion({ id: 'p-b', discountType: 'FIXED_MINOR', valueMinor: 10_000 }),
      promotion({ id: 'p-a', discountType: 'FIXED_MINOR', valueMinor: 10_000 }),
    ];
    expect(selectPromotion(sameTime, 100_000, context())?.promotion.id).toBe('p-a');
  });
});

describe('coupon usability (06-C02)', () => {
  it('honors activity, window and usage cap', () => {
    const now = new Date('2026-08-15T12:00:00Z');
    expect(isCouponUsable(coupon(), now)).toBe(true);
    expect(isCouponUsable(coupon({ active: false }), now)).toBe(false);
    expect(isCouponUsable(coupon({ effectiveFrom: new Date('2026-09-01T00:00:00Z') }), now)).toBe(false);
    expect(
      isCouponUsable(coupon({ effectiveUntil: new Date('2026-08-15T12:00:00Z') }), now),
    ).toBe(false);
    expect(isCouponUsable(coupon({ maxUses: 3, usedCount: 3 }), now)).toBe(false);
    expect(isCouponUsable(coupon({ maxUses: 3, usedCount: 2 }), now)).toBe(true);
  });
});

describe('haversine distance (06-C, R1 straight line)', () => {
  it('returns zero for the same point', () => {
    expect(haversineDistanceKm(36.7538, 3.0588, 36.7538, 3.0588)).toBe(0);
  });

  it('measures a known city pair within ~1km', () => {
    const parisToLondon = haversineDistanceKm(48.8566, 2.3522, 51.5074, -0.1278);
    expect(parisToLondon).toBeCloseTo(343.5, 0);
  });
});

describe('after-hours detection (06-C07, tenant timezone)', () => {
  const hours = [{ dayOfWeek: 1, opensAt: '08:00', closesAt: '18:00' }]; // Monday
  const mondayMorning = new Date('2026-01-05T05:00:00Z'); // UTC
  const mondayMidday = new Date('2026-01-05T11:00:00Z');

  it('flags instants before opening and at/after closing', () => {
    expect(isAfterHours(mondayMorning, 'UTC', hours)).toBe(true);
    expect(isAfterHours(mondayMidday, 'UTC', hours)).toBe(false);
    expect(isAfterHours(new Date('2026-01-05T18:00:00Z'), 'UTC', hours)).toBe(true);
  });

  it('supports overnight windows', () => {
    const overnight = [{ dayOfWeek: 1, opensAt: '18:00', closesAt: '06:00' }];
    expect(isAfterHours(new Date('2026-01-05T12:00:00Z'), 'UTC', overnight)).toBe(true);
    expect(isAfterHours(new Date('2026-01-05T22:00:00Z'), 'UTC', overnight)).toBe(false);
  });

  it('is never after-hours without configured hours or on a closed day', () => {
    expect(isAfterHours(mondayMorning, 'UTC', [])).toBe(false);
    const closed = [{ dayOfWeek: 1, opensAt: '00:00', closesAt: '00:00' }];
    expect(isAfterHours(mondayMorning, 'UTC', closed)).toBe(false);
  });

  it('evaluates the weekday in the tenant timezone', () => {
    // 2026-01-05T04:00:00Z is 05:00 on Monday in Africa/Algiers (UTC+1, no DST).
    const algiers = new Date('2026-01-05T04:00:00Z');
    expect(isAfterHours(algiers, 'Africa/Algiers', hours)).toBe(true);
    expect(isAfterHours(mondayMidday, 'Africa/Algiers', hours)).toBe(false);
  });
});

describe('deposit policy selection (06-C08)', () => {
  it('prefers vehicle over category over global', () => {
    const vehicle = policy({
      id: 'v',
      scopes: [{ vehicleId: 'veh-1', categoryId: null }],
    });
    const category = policy({
      id: 'c',
      scopes: [{ vehicleId: null, categoryId: 'cat-1' }],
    });
    const global = policy({ id: 'g', scopes: [] });
    expect(selectDepositPolicy([global, category, vehicle], 'veh-1', 'cat-1')?.id).toBe('v');
    expect(selectDepositPolicy([global, category, vehicle], 'veh-2', 'cat-1')?.id).toBe('c');
    expect(selectDepositPolicy([global, category, vehicle], 'veh-2', 'cat-2')?.id).toBe('g');
  });

  it('skips inactive policies and returns null without a match', () => {
    expect(selectDepositPolicy([policy({ active: false })], null, null)).toBeNull();
    expect(
      selectDepositPolicy([policy({ scopes: [{ vehicleId: 'veh-1', categoryId: null }] })], null, null),
    ).toBeNull();
  });
});

describe('deposit amount (06-C08)', () => {
  it('returns fixed amounts as-is and percent amounts as basis points', () => {
    expect(depositAmountMinor(policy({ depositType: 'FIXED_MINOR', valueMinor: 80_000 }), 500_000)).toBe(80_000);
    expect(depositAmountMinor(policy({ depositType: 'PERCENT_OF_TOTAL', valueMinor: 2000 }), 500_000)).toBe(100_000);
    expect(depositAmountMinor(policy({ depositType: 'PERCENT_OF_TOTAL', valueMinor: 2000 }), 499_999)).toBe(100_000);
  });
});
