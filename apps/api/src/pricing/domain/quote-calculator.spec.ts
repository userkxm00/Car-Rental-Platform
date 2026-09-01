import { haversineDistanceKm, type DepositPolicyCandidate } from './commercial-rules';
import {
  calculateQuote,
  NoPricingConfigurationError,
  ratePlanCandidateForTarget,
  type BranchPointInput,
  type QuoteCalculationInput,
  type QuotePlanInput,
} from './quote-calculator';

/**
 * 06-D05: the calculator composes 06-A + 06-B + 06-C into one
 * deterministic, integer-minor total. The representative scenario is
 * hand-computed: identical inputs must reproduce identical totals.
 */

const ALGIERS = 'Africa/Algiers';

function plan(overrides: Partial<QuotePlanInput> = {}): QuotePlanInput {
  return {
    id: 'plan-1',
    code: 'BASE',
    name: 'Base rate',
    currency: 'DZD',
    durationUnit: 'DAILY',
    baseRateMinor: 5000,
    precedence: 0,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveUntil: null,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    scopes: [],
    tiers: [],
    adjustments: [],
    ...overrides,
  };
}

function branch(overrides: Partial<BranchPointInput> = {}): BranchPointInput {
  return {
    branchId: 'branch-a',
    timezone: null,
    latitude: null,
    longitude: null,
    hours: [
      { dayOfWeek: 0, opensAt: '08:00', closesAt: '18:00' },
      { dayOfWeek: 1, opensAt: '08:00', closesAt: '18:00' },
      { dayOfWeek: 2, opensAt: '08:00', closesAt: '18:00' },
      { dayOfWeek: 3, opensAt: '08:00', closesAt: '18:00' },
      { dayOfWeek: 4, opensAt: '08:00', closesAt: '18:00' },
      { dayOfWeek: 5, opensAt: '08:00', closesAt: '18:00' },
      { dayOfWeek: 6, opensAt: '08:00', closesAt: '18:00' },
    ],
    ...overrides,
  };
}

function baseInput(overrides: Partial<QuoteCalculationInput> = {}): QuoteCalculationInput {
  return {
    now: new Date('2026-09-01T00:00:00Z'),
    start: new Date('2026-09-01T04:00:00Z'),
    end: new Date('2026-09-05T04:00:00Z'),
    vehicleId: 'veh-1',
    categoryId: null,
    pickupBranchId: 'branch-a',
    returnBranchId: 'branch-b',
    deliveryZoneId: 'zone-1',
    pickupBranch: branch({ branchId: 'branch-a' }),
    returnBranch: branch({ branchId: 'branch-b' }),
    tenantTimezone: ALGIERS,
    plans: [plan()],
    promotions: [],
    feeRules: [],
    depositPolicies: [],
    ...overrides,
  };
}

describe('rate plan scope mapping (06-A06 → engine)', () => {
  it('maps no scopes to GLOBAL, vehicle/category matches to their kinds, and excludes non-matching scoped plans', () => {
    expect(ratePlanCandidateForTarget(plan(), 'veh-1', 'cat-1')?.scopeKind).toBe('GLOBAL');
    const vehicleScoped = plan({
      id: 'p-v',
      scopes: [{ vehicleId: 'veh-1', categoryId: null }],
    });
    expect(ratePlanCandidateForTarget(vehicleScoped, 'veh-1', 'cat-1')?.scopeKind).toBe('VEHICLE');
    expect(ratePlanCandidateForTarget(vehicleScoped, 'veh-9', 'cat-1')).toBeNull();
    const categoryScoped = plan({
      id: 'p-c',
      scopes: [{ vehicleId: null, categoryId: 'cat-1' }],
    });
    expect(ratePlanCandidateForTarget(categoryScoped, 'veh-1', 'cat-1')?.scopeKind).toBe(
      'CATEGORY',
    );
    expect(ratePlanCandidateForTarget(categoryScoped, 'veh-1', 'cat-9')).toBeNull();
  });
});

describe('quote calculation (06-D05)', () => {
  it('throws the stable no-configuration signal when no plan applies', () => {
    expect(() => calculateQuote(baseInput({ plans: [] }))).toThrow(NoPricingConfigurationError);
    const future = plan({ effectiveFrom: new Date('2027-01-01T00:00:00Z') });
    expect(() => calculateQuote(baseInput({ plans: [future] }))).toThrow(
      NoPricingConfigurationError,
    );
    const scopedOut = plan({ scopes: [{ vehicleId: 'other-vehicle', categoryId: null }] });
    expect(() => calculateQuote(baseInput({ plans: [scopedOut] }))).toThrow(
      NoPricingConfigurationError,
    );
  });

  it('reproduces the hand-computed representative total (06-D05 gate scenario)', () => {
    const input = baseInput({
      plans: [
        plan({
          tiers: [{ upToUnits: 2, rateMinor: 6000 }],
          adjustments: [
            {
              kind: 'WEEKEND',
              adjustmentType: 'FLAT_PER_UNIT',
              windowStart: null,
              windowEnd: null,
              date: null,
              daysOfWeek: [5, 6],
              valueMinor: 1000,
              precedence: 10,
            },
          ],
        }),
      ],
      promotions: [
        {
          id: 'promo-1',
          code: 'SUMMER10',
          discountType: 'PERCENT',
          valueMinor: 1000,
          minDurationUnits: null,
          durationUnit: null,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveUntil: null,
          maxRedemptions: null,
          redemptionsCount: 0,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          scopes: [],
        },
      ],
      feeRules: [
        {
          id: 'fee-1',
          kind: 'DELIVERY_FEE',
          deliveryZoneId: 'zone-1',
          branchId: null,
          baseMinor: 2000,
          perKmMinor: null,
          perOccurrenceMinor: null,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'fee-2',
          kind: 'ONE_WAY_FEE',
          deliveryZoneId: null,
          branchId: null,
          baseMinor: 1500,
          perKmMinor: null,
          perOccurrenceMinor: null,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 'fee-3',
          kind: 'AFTER_HOURS_FEE',
          deliveryZoneId: null,
          branchId: null,
          baseMinor: 0,
          perKmMinor: null,
          perOccurrenceMinor: 800,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      depositPolicies: [
        {
          id: 'dep-1',
          depositType: 'FIXED_MINOR',
          valueMinor: 50_000,
          active: true,
          scopes: [],
        },
      ],
    });

    const result = calculateQuote(input);

    // Ladder 2×6000 + 2×5000 = 22 000; + Fri weekend 1 000 → 23 000;
    // −10% promotion 2 300 → 20 700; + delivery 2 000 + one-way 1 500
    // + 2 after-hours occurrences 1 600 → 25 800 DZD.
    expect(result.totalMinor).toBe(25_800);
    expect(result.currency).toBe('DZD');
    expect(result.durationUnits).toBe(4);
    expect(result.appliedPromotionCode).toBe('SUMMER10');
    expect(result.appliedCouponCode).toBeNull();
    expect(result.depositMinor).toBe(50_000);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        { code: 'RENTAL', amountMinor: 22_000 },
        { code: 'TIME_WEEKEND', amountMinor: 1000 },
        { code: 'PROMOTION_DISCOUNT', amountMinor: -2300 },
        { code: 'DELIVERY_FEE', amountMinor: 2000 },
        { code: 'ONE_WAY_FEE', amountMinor: 1500 },
        { code: 'AFTER_HOURS_FEE', amountMinor: 1600 },
      ]),
    );
    // The breakdown reconciles: signed lines sum exactly to the total.
    const linesTotal = result.lines.reduce((sum, line) => sum + line.amountMinor, 0);
    expect(linesTotal).toBe(result.totalMinor);
  });

  it('lets a usable coupon win over promotions (06-C02 stacking)', () => {
    const input = baseInput({
      feeRules: [],
      promotions: [
        {
          id: 'promo-1',
          code: 'BIGPROMO',
          discountType: 'FIXED_MINOR',
          valueMinor: 5000,
          minDurationUnits: null,
          durationUnit: null,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveUntil: null,
          maxRedemptions: null,
          redemptionsCount: 0,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          scopes: [],
        },
      ],
      coupon: {
        id: 'coupon-1',
        code: 'WELCOME20',
        discountType: 'PERCENT',
        valueMinor: 2000,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveUntil: null,
        maxUses: null,
        usedCount: 0,
        active: true,
      },
    });

    const result = calculateQuote(input);
    // Ladder 20 000 − 4 000 (20%) = 16 000; the 5 000 fixed promotion is ignored.
    expect(result.totalMinor).toBe(16_000);
    expect(result.appliedCouponCode).toBe('WELCOME20');
    expect(result.appliedPromotionCode).toBeNull();
    expect(result.lines).toContainEqual({ code: 'COUPON_DISCOUNT', amountMinor: -4000 });
    expect(result.lines.some((line) => line.code === 'PROMOTION_DISCOUNT')).toBe(false);
  });

  it('prices extras from the catalog in their own pricing units (06-C03)', () => {
    const input = baseInput({
      feeRules: [],
      extraSelections: [
        { key: 'GPS', pricingUnit: 'PER_DAY', amountMinor: 500, quantity: 2 },
        { key: 'SEAT', pricingUnit: 'PER_BOOKING', amountMinor: 3000, quantity: 1 },
        { key: 'MILEAGE', pricingUnit: 'PER_RENTAL_UNIT', amountMinor: 1000, quantity: 1 },
      ],
    });
    const result = calculateQuote(input);
    // 500×2×4 days + 3000 + 1000×4 units = 4000 + 3000 + 4000 = 11 000.
    expect(result.totalMinor).toBe(20_000 + 11_000);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        { code: 'EXTRA_GPS', amountMinor: 4000 },
        { code: 'EXTRA_SEAT', amountMinor: 3000 },
        { code: 'EXTRA_MILEAGE', amountMinor: 4000 },
      ]),
    );
  });

  it('charges distance fees only with coordinates and computes straight-line km (06-C05)', () => {
    const input = baseInput({
      feeRules: [
        {
          id: 'fee-1',
          kind: 'DISTANCE_FEE',
          deliveryZoneId: 'zone-1',
          branchId: null,
          baseMinor: 0,
          perKmMinor: 10,
          perOccurrenceMinor: null,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
      pickupBranch: branch({ latitude: 36.7538, longitude: 3.0588 }),
      returnBranch: branch({ latitude: 35.6987, longitude: -0.6363 }),
    });
    const result = calculateQuote(input);
    const expected = Math.round(haversineDistanceKm(36.7538, 3.0588, 35.6987, -0.6363) * 10);
    expect(result.lines).toContainEqual({ code: 'DISTANCE_FEE', amountMinor: expected });
    // 20 000 + 3 516 → rounded to whole DZD = 23 500.
    expect(result.totalMinor).toBe(23_500);

    // Without coordinates no distance charge is applied.
    const noCoords = calculateQuote(
      baseInput({ feeRules: input.feeRules, pickupBranch: branch(), returnBranch: branch() }),
    );
    expect(noCoords.lines.some((line) => line.code === 'DISTANCE_FEE')).toBe(false);
    expect(noCoords.totalMinor).toBe(20_000);
  });

  it('selects the most specific deposit policy and keeps the deposit separate (06-C08)', () => {
    const vehicleDeposit: DepositPolicyCandidate = {
      id: 'dep-v',
      depositType: 'PERCENT_OF_TOTAL',
      valueMinor: 2000,
      active: true,
      scopes: [{ vehicleId: 'veh-1', categoryId: null }],
    };
    const input = baseInput({
      feeRules: [],
      depositPolicies: [
        { id: 'dep-g', depositType: 'FIXED_MINOR', valueMinor: 50_000, active: true, scopes: [] },
        vehicleDeposit,
      ],
    });
    const result = calculateQuote(input);
    // 20 000 × 20% = 4 000 deposit; the total itself is untouched.
    expect(result.depositMinor).toBe(4000);
    expect(result.totalMinor).toBe(20_000);
  });

  it('rounds totals to the currency precision (06-D02/D04, TND 3 decimals)', () => {
    const tnd = plan({ currency: 'TND', baseRateMinor: 999 });
    const result = calculateQuote(baseInput({ plans: [tnd], feeRules: [] }));
    // 4 days × 999 = 3 996 → rounds to the nearest 1000 (TND precision).
    expect(result.totalMinor).toBe(4000);
  });

  it('is deterministic: identical inputs reproduce identical results (06-D05)', () => {
    const input = baseInput({
      plans: [plan({ tiers: [{ upToUnits: 2, rateMinor: 6000 }] })],
      promotions: [
        {
          id: 'promo-1',
          code: 'SUMMER10',
          discountType: 'PERCENT',
          valueMinor: 1000,
          minDurationUnits: null,
          durationUnit: null,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveUntil: null,
          maxRedemptions: null,
          redemptionsCount: 0,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          scopes: [],
        },
      ],
      feeRules: [],
    });
    const first = calculateQuote(input);
    const second = calculateQuote(input);
    expect(second).toEqual(first);
  });
});
