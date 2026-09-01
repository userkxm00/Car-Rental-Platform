import {
  ADJUSTMENT_STAGE_ORDER,
  baseAmountForDuration,
  buildDurationBuckets,
  durationUnitsInInterval,
  durationUnitStarts,
  localDayKey,
  localDayOfWeek,
  percentOfMinor,
  roundMinorToPrecision,
  applyTimeAdjustments,
  type TimeAdjustmentContext,
  type TimeAdjustmentRule,
} from './time-rules';

/**
 * 06-B01..B08: the duration ladder and the time adjustments are pure,
 * deterministic functions — the same inputs always produce the same
 * integer-minor result (architecture/pricing-engine.md).
 */

const DZ: TimeAdjustmentContext = { timezone: 'Africa/Algiers', holidayWeekendFastPath: true };
const DZ_OFF: TimeAdjustmentContext = { timezone: 'Africa/Algiers', holidayWeekendFastPath: false };

const FRIDAY_NOON_ALGIERS = new Date('2026-09-04T11:00:00Z'); // 12:00 +01:00
const SATURDAY_ALGIERS = new Date('2026-09-05T11:00:00Z');
const MONDAY_ALGIERS = new Date('2026-09-07T11:00:00Z');

describe('time rules (06-B01…B08)', () => {
  it('counts billable duration units with ceiling (06-B01…B04)', () => {
    const hour = { start: new Date('2026-09-01T08:00:00Z'), end: new Date('2026-09-01T09:00:00Z') };
    expect(durationUnitsInInterval('HOURLY', hour)).toBe(1);
    expect(
      durationUnitsInInterval('HOURLY', {
        start: hour.start,
        end: new Date('2026-09-01T08:05:00Z'),
      }),
    ).toBe(1);
    expect(
      durationUnitsInInterval('DAILY', {
        start: hour.start,
        end: new Date('2026-09-03T08:00:00Z'),
      }),
    ).toBe(2);
    expect(
      durationUnitsInInterval('DAILY', {
        start: hour.start,
        end: new Date('2026-09-03T08:00:01Z'),
      }),
    ).toBe(3);
    expect(durationUnitsInInterval('WEEKLY', { start: hour.start, end: hour.start })).toBe(0);
    expect(
      durationUnitsInInterval('MONTHLY', {
        start: hour.start,
        end: new Date('2026-09-01T08:00:00Z'),
      }),
    ).toBe(0);
  });

  it('builds the duration ladder: tiers cover units, open tier covers the rest, base rate is the fallback (06-B05)', () => {
    const tiers = [
      { upToUnits: 2, rateMinor: 4000 },
      { upToUnits: null, rateMinor: 3000 },
    ];
    const buckets = buildDurationBuckets(4, 5000, tiers);
    expect(buckets).toEqual([
      { unitIndex: 1, rateMinor: 4000 },
      { unitIndex: 2, rateMinor: 4000 },
      { unitIndex: 3, rateMinor: 3000 },
      { unitIndex: 4, rateMinor: 3000 },
    ]);
    expect(baseAmountForDuration(4, 5000, tiers)).toBe(14000);

    // No tiers → pure base rate.
    expect(baseAmountForDuration(3, 5000, [])).toBe(15000);
    // Tiers shorter than the duration: uncovered units fall back.
    expect(baseAmountForDuration(3, 5000, [{ upToUnits: 1, rateMinor: 6000 }])).toBe(16000);
    // Degenerate interval → no buckets.
    expect(buildDurationBuckets(0, 5000, tiers)).toEqual([]);
  });

  it('rounds minor amounts centrally, halves away from zero (06-D02)', () => {
    expect(roundMinorToPrecision(125, 100)).toBe(100);
    expect(roundMinorToPrecision(150, 100)).toBe(200);
    expect(roundMinorToPrecision(151, 100)).toBe(200);
    expect(roundMinorToPrecision(-125, 100)).toBe(-100);
    expect(roundMinorToPrecision(-150, 100)).toBe(-200);
    expect(roundMinorToPrecision(123456, 100)).toBe(123500);
  });

  it('computes basis-point percentages in integer arithmetic (06-B06)', () => {
    expect(percentOfMinor(5000, 100)).toBe(50);
    expect(percentOfMinor(5000, 1500)).toBe(750);
    expect(percentOfMinor(999, 333)).toBe(33);
  });

  it('keys local days and weekdays in the tenant timezone (06-B07/B08)', () => {
    expect(localDayKey(FRIDAY_NOON_ALGIERS, 'Africa/Algiers')).toBe('2026-09-04');
    expect(localDayOfWeek(FRIDAY_NOON_ALGIERS, 'Africa/Algiers')).toBe(5);
    expect(localDayOfWeek(SATURDAY_ALGIERS, 'Africa/Algiers')).toBe(6);
    expect(localDayOfWeek(MONDAY_ALGIERS, 'Africa/Algiers')).toBe(1);
    // An instant just after local midnight belongs to the new day.
    expect(localDayKey(new Date('2026-09-04T23:30:00Z'), 'Africa/Algiers')).toBe('2026-09-05');
  });

  it('applies the fixed stage order SEASONAL → WEEKEND → HOLIDAY → SPECIAL_DATE (06-B06)', () => {
    const interval = {
      start: FRIDAY_NOON_ALGIERS,
      end: new Date(FRIDAY_NOON_ALGIERS.getTime() + 24 * 3600_000),
    };
    const base = 5000;
    const rules: TimeAdjustmentRule[] = [
      {
        kind: 'SEASONAL',
        adjustmentType: 'PERCENT',
        windowStart: new Date('2026-09-01T00:00:00Z'),
        windowEnd: new Date('2026-10-01T00:00:00Z'),
        date: null,
        daysOfWeek: [],
        valueMinor: 2000,
        precedence: 1,
      },
      {
        kind: 'WEEKEND',
        adjustmentType: 'FLAT_PER_UNIT',
        windowStart: null,
        windowEnd: null,
        date: null,
        daysOfWeek: [5, 6],
        valueMinor: 300,
        precedence: 1,
      },
      {
        kind: 'SPECIAL_DATE',
        adjustmentType: 'PERCENT',
        windowStart: null,
        windowEnd: null,
        date: '2026-09-04',
        daysOfWeek: [],
        valueMinor: 500,
        precedence: 1,
      },
    ];
    const result = applyTimeAdjustments(interval, 'DAILY', base, rules, DZ_OFF);
    // 1 daily unit: +20% seasonal (+1000) + weekend flat (+300) + 5% special (+250) = 6550 → rounded 6600
    expect(result.lines).toEqual(
      expect.arrayContaining([
        { kind: 'SEASONAL', adjustmentType: 'PERCENT', amountMinor: 1000 },
        { kind: 'WEEKEND', adjustmentType: 'FLAT_PER_UNIT', amountMinor: 300 },
        { kind: 'SPECIAL_DATE', adjustmentType: 'PERCENT', amountMinor: 250 },
      ]),
    );
    expect(result.totalMinor).toBe(6600);
    expect(ADJUSTMENT_STAGE_ORDER).toEqual(['SEASONAL', 'WEEKEND', 'HOLIDAY', 'SPECIAL_DATE']);
  });

  it('lets the highest precedence rule win within a stage', () => {
    const interval = {
      start: FRIDAY_NOON_ALGIERS,
      end: new Date(FRIDAY_NOON_ALGIERS.getTime() + 3600_000),
    };
    const rules: TimeAdjustmentRule[] = [
      { kind: 'WEEKEND', adjustmentType: 'FLAT_PER_UNIT', windowStart: null, windowEnd: null, date: null, daysOfWeek: [5], valueMinor: 100, precedence: 1 },
      { kind: 'WEEKEND', adjustmentType: 'FLAT_PER_UNIT', windowStart: null, windowEnd: null, date: null, daysOfWeek: [5], valueMinor: 900, precedence: 9 },
    ];
    const result = applyTimeAdjustments(interval, 'HOURLY', 1000, rules, DZ_OFF);
    const weekendLines = result.lines.filter((line) => line.kind === 'WEEKEND');
    expect(weekendLines).toEqual([{ kind: 'WEEKEND', adjustmentType: 'FLAT_PER_UNIT', amountMinor: 900 }]);
  });

  it('marks Fri/Sat via the holiday fast path, but configured holidays win (06-B08)', () => {
    const interval = {
      start: FRIDAY_NOON_ALGIERS,
      end: new Date(FRIDAY_NOON_ALGIERS.getTime() + 3600_000),
    };
    // Fast path ON, no HOLIDAY rules: the unit carries a zero HOLIDAY line.
    const fast = applyTimeAdjustments(interval, 'HOURLY', 1000, [], DZ);
    expect(fast.lines).toEqual(
      expect.arrayContaining([{ kind: 'HOLIDAY', adjustmentType: 'FLAT_PER_UNIT', amountMinor: 0 }]),
    );
    // Fast path OFF: no holiday line.
    const off = applyTimeAdjustments(interval, 'HOURLY', 1000, [], DZ_OFF);
    expect(off.lines.some((line) => line.kind === 'HOLIDAY')).toBe(false);
    // Configured HOLIDAY rules exist: fast path does not fire.
    const configured = applyTimeAdjustments(
      interval,
      'HOURLY',
      1000,
      [{ kind: 'HOLIDAY', adjustmentType: 'FLAT_PER_UNIT', windowStart: null, windowEnd: null, date: '2026-09-04', daysOfWeek: [], valueMinor: 250, precedence: 1 }],
      DZ,
    );
    expect(configured.lines).toEqual([{ kind: 'HOLIDAY', adjustmentType: 'FLAT_PER_UNIT', amountMinor: 250 }]);
  });

  it('walks consecutive unit starts for an interval (06-B)', () => {
    const interval = {
      start: new Date('2026-09-01T08:00:00Z'),
      end: new Date('2026-09-02T08:00:00Z'),
    };
    const starts = durationUnitStarts(interval, 'HOURLY', 3);
    expect(starts.map((d) => d.toISOString())).toEqual([
      '2026-09-01T08:00:00.000Z',
      '2026-09-01T09:00:00.000Z',
      '2026-09-01T10:00:00.000Z',
    ]);
  });
});
