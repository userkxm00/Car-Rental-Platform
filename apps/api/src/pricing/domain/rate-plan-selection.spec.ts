import {
  compareRatePlanCandidates,
  isRatePlanEffective,
  ratePlanSpecificity,
  selectEffectiveRatePlan,
  type RatePlanCandidate,
} from './rate-plan-selection';

/**
 * 06-A06: the deterministic precedence order is one pure function — the
 * 06-B engine consumes it, so ambiguity must be impossible by
 * construction (architecture/pricing-engine.md).
 */

function candidate(overrides: Partial<RatePlanCandidate> = {}): RatePlanCandidate {
  return {
    id: 'p-1',
    currency: 'DZD',
    durationUnit: 'DAILY',
    baseRateMinor: 5000,
    precedence: 0,
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    effectiveUntil: null,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    scopeKind: 'GLOBAL',
    ...overrides,
  };
}

describe('rate plan precedence (06-A06)', () => {
  it('ranks scope specificity first: VEHICLE > CATEGORY > GLOBAL', () => {
    const vehicle = candidate({ id: 'v', scopeKind: 'VEHICLE', vehicleId: 'veh-1' });
    const category = candidate({ id: 'c', scopeKind: 'CATEGORY', categoryId: 'cat-1' });
    const global = candidate({ id: 'g', scopeKind: 'GLOBAL' });
    expect(ratePlanSpecificity('VEHICLE')).toBeGreaterThan(ratePlanSpecificity('CATEGORY'));
    expect(ratePlanSpecificity('CATEGORY')).toBeGreaterThan(ratePlanSpecificity('GLOBAL'));
    expect(compareRatePlanCandidates(vehicle, category)).toBeLessThan(0);
    expect(compareRatePlanCandidates(vehicle, global)).toBeLessThan(0);
    expect(compareRatePlanCandidates(category, global)).toBeLessThan(0);
  });

  it('breaks equal specificity by precedence, then effectiveFrom, then createdAt, then id', () => {
    const highPrecedence = candidate({ id: 'a', precedence: 10, createdAt: new Date('2026-08-01T00:00:00Z') });
    const lowPrecedence = candidate({ id: 'b', precedence: 0, createdAt: new Date('2026-08-01T00:00:00Z') });
    expect(compareRatePlanCandidates(highPrecedence, lowPrecedence)).toBeLessThan(0);

    const newerWindow = candidate({ id: 'x', effectiveFrom: new Date('2026-09-01T00:00:00Z'), createdAt: new Date('2026-08-01T00:00:00Z') });
    const olderWindow = candidate({ id: 'y', effectiveFrom: new Date('2026-08-01T00:00:00Z'), createdAt: new Date('2026-08-01T00:00:00Z') });
    expect(compareRatePlanCandidates(newerWindow, olderWindow)).toBeLessThan(0);

    const firstCreated = candidate({ id: 'i1', createdAt: new Date('2026-08-01T00:00:00Z') });
    const secondCreated = candidate({ id: 'i2', createdAt: new Date('2026-08-02T00:00:00Z') });
    expect(compareRatePlanCandidates(firstCreated, secondCreated)).toBeLessThan(0);

    // Total order: identical candidates differ only by id → no ambiguity.
    expect(compareRatePlanCandidates(candidate({ id: 'z' }), candidate({ id: 'a' }))).toBeGreaterThan(0);
    expect(compareRatePlanCandidates(candidate({ id: 'a' }), candidate({ id: 'a' }))).toBe(0);
  });

  it('treats the effective window as half-open [from, until) (06-A03)', () => {
    const now = new Date('2026-08-15T00:00:00Z');
    expect(
      isRatePlanEffective(
        candidate({ effectiveFrom: new Date('2026-08-01T00:00:00Z'), effectiveUntil: null }),
        now,
      ),
    ).toBe(true);
    expect(
      isRatePlanEffective(
        candidate({ effectiveFrom: new Date('2026-08-16T00:00:00Z'), effectiveUntil: null }),
        now,
      ),
    ).toBe(false);
    expect(
      isRatePlanEffective(
        candidate({
          effectiveFrom: new Date('2026-08-01T00:00:00Z'),
          effectiveUntil: new Date('2026-08-15T00:00:00Z'),
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isRatePlanEffective(
        candidate({
          effectiveFrom: new Date('2026-08-01T00:00:00Z'),
          effectiveUntil: new Date('2026-08-16T00:00:00Z'),
        }),
        now,
      ),
    ).toBe(true);
    expect(isRatePlanEffective(candidate({ active: false }), now)).toBe(false);
  });

  it('selects the single winner or null when nothing is effective', () => {
    const now = new Date('2026-08-15T00:00:00Z');
    const winner = candidate({
      id: 'winner',
      scopeKind: 'VEHICLE',
      vehicleId: 'veh-1',
      precedence: 5,
      effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    });
    // Effective but lower-ranking: CATEGORY loses to the VEHICLE winner even
    // with a much higher precedence.
    const lowerSpecificity = candidate({
      id: 'l1',
      scopeKind: 'CATEGORY',
      categoryId: 'cat-1',
      precedence: 99,
    });
    const selected = selectEffectiveRatePlan([lowerSpecificity, winner], now);
    expect(selected?.id).toBe('winner');

    // No effective candidate at all → null.
    const notEffective = [
      candidate({ id: 'l2', effectiveFrom: new Date('2026-09-01T00:00:00Z'), precedence: 99 }),
      candidate({ id: 'l3', active: false, precedence: 99 }),
      candidate({ id: 'l4', effectiveUntil: new Date('2026-08-10T00:00:00Z'), precedence: 99 }),
    ];
    expect(selectEffectiveRatePlan(notEffective, now)).toBeNull();
  });
});
