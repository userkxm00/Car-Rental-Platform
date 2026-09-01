/**
 * PHASE-06 / 06-B: time-rule calculation — pure, deterministic, and
 * integer-safe (never floating point for money).
 *
 * Stage order is fixed (architecture/pricing-engine.md "deterministic
 * precedence order"); later stages adjust the earlier result:
 *
 *   SEASONAL → WEEKEND → HOLIDAY → SPECIAL_DATE
 *
 * R1 boundary: calendar logic operates on the tenant timezone in
 * `+01:00/+02:00` (Africa/Algiers rule; DST = Ramadan in Algeria). The
 * fast path marks Fri/Sat as holiday-weekend when no HOLIDAY adjustment
 * is configured (docs/06 — Friday/Saturday weekend; holiday seed rules
 * land with 06-B06); configured HOLIDAY rules always win.
 *
 * Duration combination (hourly→daily tiers, 06-B01..B05) is
 * duration-ticks-only in R1: each full unit of the plan's duration unit
 * is priced by the tier whose `upToUnits` first covers it (the open tier
 * covers the rest; absent tiers = the plan base rate). Mixed
 * hourly-over-daily combination semantics are defined in
 * architecture/pricing-engine.md "Duration combination R1".
 */

export const RateAdjustmentKind = {
  SEASONAL: 'SEASONAL',
  SPECIAL_DATE: 'SPECIAL_DATE',
  WEEKEND: 'WEEKEND',
  HOLIDAY: 'HOLIDAY',
} as const;
export type RateAdjustmentKindValue = (typeof RateAdjustmentKind)[keyof typeof RateAdjustmentKind];

export const RateAdjustmentType = {
  PERCENT: 'PERCENT',
  FLAT_PER_UNIT: 'FLAT_PER_UNIT',
} as const;
export type RateAdjustmentTypeValue = (typeof RateAdjustmentType)[keyof typeof RateAdjustmentType];

export const ADJUSTMENT_STAGE_ORDER: readonly RateAdjustmentKindValue[] = [
  'SEASONAL',
  'WEEKEND',
  'HOLIDAY',
  'SPECIAL_DATE',
];

/** R1 calendar: Algeria weekend (docs/06-business-rules.md). */
export const HOLIDAY_WEEKEND_DAYS = [5, 6];

export const MAX_ADJUSTMENT_AMOUNT_MINOR = 1_000_000_000;
export const MAX_ADJUSTMENT_PRECEDENCE = 1_000_000;
export const MAX_TIERS = 50;
/** A tier must be at least 2 units long (a 1-unit tier is a base rate). */
export const MIN_TIER_UNITS = 2;
export const MAX_TIER_UNITS = 10_000;
export const MAX_TIER_RATE_MINOR = 1_000_000_000;
/** Basis points: PERCENT valueMinor == 100 is 1%. */
export const MAX_PERCENT_BASIS_POINTS = 1_000_000;

/** Minutes per duration unit — the 06-B01..B04 reference grid. */
export const MINUTES_PER_UNIT: Record<string, number> = {
  HOURLY: 60,
  DAILY: 24 * 60,
  WEEKLY: 7 * 24 * 60,
  BIWEEKLY: 14 * 24 * 60,
  MONTHLY: 30 * 24 * 60,
};

export interface RatePlanTierRule {
  upToUnits: number | null;
  rateMinor: number;
}

export interface TimeAdjustmentRule {
  kind: RateAdjustmentKindValue;
  adjustmentType: RateAdjustmentTypeValue;
  windowStart: Date | null;
  windowEnd: Date | null;
  /** R1: plain calendar day in the tenant timezone (no time-of-day). */
  date: string | null;
  daysOfWeek: number[];
  valueMinor: number;
  precedence: number;
}

export interface TimeAdjustmentContext {
  /** Tenant IANA timezone (Africa/Algiers etc). */
  timezone: string;
  /** R1: whether the tenant enables the holiday-weekend fast path. */
  holidayWeekendFastPath: boolean;
}

export interface TimeAdjustmentLine {
  kind: RateAdjustmentKindValue;
  adjustmentType: RateAdjustmentTypeValue;
  amountMinor: number;
}

/**
 * Rounds a minor amount to `precision` minor units, halves away from
 * zero — centralized (06-D02). Currencies with 2-decimal minors (DZD,
 * EUR, USD, MAD) share precision 100; TND (3 decimals) uses 1000 —
 * see `pricing/domain/money.ts` (06-D04).
 */
export function roundMinorToPrecision(amountMinor: number, precision: number): number {
  const sign = amountMinor < 0 ? -1 : 1;
  const magnitude = Math.abs(amountMinor);
  const rounded = Math.floor(magnitude / precision + 0.5) * precision;
  return sign * rounded;
}

/** PERCENT valueMinor is basis points: 1500 → +15%. */
export function percentOfMinor(baseMinor: number, basisPoints: number): number {
  return Math.round((baseMinor * basisPoints) / 10_000);
}

/** Whole billable duration units of a plan's unit for an interval. */
export function durationUnitsInInterval(
  unit: string,
  interval: { start: Date; end: Date },
): number {
  const minutesPerUnit = MINUTES_PER_UNIT[unit];
  const durationMinutes = Math.max(0, interval.end.getTime() - interval.start.getTime()) / 60_000;
  if (!minutesPerUnit) {
    return 0;
  }
  return Math.max(0, Math.ceil((durationMinutes - 1e-9) / minutesPerUnit));
}

/**
 * Duration ladder (06-B05): per-unit rate for units 1..unitCount. Each
 * unit is priced by the tier with the smallest `upToUnits >= unit`
 * (the open tier covers the rest); units past every tier fall back to
 * the plan base rate.
 */
export function buildDurationBuckets(
  unitCount: number,
  baseRateMinor: number,
  tiers: RatePlanTierRule[],
): Array<{ unitIndex: number; rateMinor: number }> {
  const count = Math.max(0, Math.ceil(unitCount - 1e-9));
  const buckets: Array<{ unitIndex: number; rateMinor: number }> = [];
  for (let unit = 1; unit <= count; unit++) {
    const covering = tiers
      .filter((tier) => tier.upToUnits === null || tier.upToUnits >= unit)
      .sort((a, b) => (a.upToUnits ?? Number.MAX_SAFE_INTEGER) - (b.upToUnits ?? Number.MAX_SAFE_INTEGER));
    const rate = covering[0]?.rateMinor ?? baseRateMinor;
    buckets.push({ unitIndex: unit, rateMinor: rate });
  }
  return buckets;
}

/** Sum of the duration ladder. */
export function baseAmountForDuration(
  unitCount: number,
  baseRateMinor: number,
  tiers: RatePlanTierRule[],
): number {
  return buildDurationBuckets(unitCount, baseRateMinor, tiers).reduce(
    (sum, bucket) => sum + bucket.rateMinor,
    0,
  );
}

/** Local (tenant timezone) key for a given day: YYYY-MM-DD. */
export function localDayKey(instant: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  }
}

/** Local (tenant timezone) day of week: 0 = Sunday … 6 = Saturday. */
export function localDayOfWeek(instant: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(formatter.format(instant));
  } catch {
    return instant.getUTCDay();
  }
}

/** Whether an instant lies in a half-open `[start, end)` window. */
function inWindow(instant: Date, rule: TimeAdjustmentRule): boolean {
  if (!rule.windowStart) {
    return false;
  }
  if (instant.getTime() < rule.windowStart.getTime()) {
    return false;
  }
  return rule.windowEnd === null || instant.getTime() < rule.windowEnd.getTime();
}

/**
 * Whether `rule` matches a duration unit starting at `unitStart` and
 * ending at `unitEnd` (both instants). Weekend/day rules use the local
 * day of `unitStart`; windows use the unit start instant.
 */
function ruleMatchesUnit(
  rule: TimeAdjustmentRule,
  unitStart: Date,
  unitEnd: Date,
  context: TimeAdjustmentContext,
): boolean {
  void unitEnd;
  switch (rule.kind) {
    case 'SEASONAL':
      return inWindow(unitStart, rule);
    case 'WEEKEND':
      return rule.daysOfWeek.includes(localDayOfWeek(unitStart, context.timezone));
    case 'HOLIDAY':
      return rule.date !== null && rule.date === localDayKey(unitStart, context.timezone);
    case 'SPECIAL_DATE':
      return rule.date !== null && rule.date === localDayKey(unitStart, context.timezone);
    default:
      return false;
  }
}

/** Unit starts: `unitCount` consecutive instants stepping by the plan unit. */
export function durationUnitStarts(
  interval: { start: Date; end: Date },
  unit: string,
  unitCount: number,
): Date[] {
  const minutesPerUnit = MINUTES_PER_UNIT[unit] ?? 0;
  if (minutesPerUnit === 0) {
    return [];
  }
  const starts: Date[] = [];
  for (let i = 0; i < unitCount; i++) {
    starts.push(new Date(interval.start.getTime() + i * minutesPerUnit * 60_000));
  }
  return starts;
}

/**
 * Applies the time adjustments in the fixed stage order. Within a stage
 * the rule with the highest precedence wins for a matching unit; the
 * total is rounded once at the end (rounding is centralized, 06-D02).
 * The fast path applies Fri/Sat as a holiday-weekend floor when the
 * tenant enables it and no HOLIDAY rule is configured.
 */
export function applyTimeAdjustments(
  interval: { start: Date; end: Date },
  unit: string,
  baseMinor: number,
  adjustments: TimeAdjustmentRule[],
  context: TimeAdjustmentContext,
): { unitAmountMinor: number; totalMinor: number; lines: TimeAdjustmentLine[] } {
  const unitCount = durationUnitsInInterval(unit, interval);
  const starts = durationUnitStarts(interval, unit, unitCount);
  const lines: TimeAdjustmentLine[] = [];
  let total = 0;

  for (const stage of ADJUSTMENT_STAGE_ORDER) {
    const stageRules = adjustments
      .filter((rule) => rule.kind === stage)
      .sort((a, b) => b.precedence - a.precedence);
    const hasConfiguredHoliday = adjustments.some((rule) => rule.kind === 'HOLIDAY');
    for (let i = 0; i < starts.length; i++) {
      const unitStart = starts[i];
      const unitEnd =
        i + 1 < starts.length
          ? starts[i + 1]
          : new Date(unitStart.getTime() + (MINUTES_PER_UNIT[unit] ?? 0) * 60_000);
      const effective = stageRules.find((rule) => ruleMatchesUnit(rule, unitStart, unitEnd, context));
      if (effective) {
        const amount =
          effective.adjustmentType === 'PERCENT'
            ? percentOfMinor(baseMinor, effective.valueMinor)
            : effective.valueMinor;
        total += amount;
        lines.push({ kind: effective.kind, adjustmentType: effective.adjustmentType, amountMinor: amount });
        continue;
      }
      if (
        stage === 'HOLIDAY' &&
        !hasConfiguredHoliday &&
        context.holidayWeekendFastPath &&
        HOLIDAY_WEEKEND_DAYS.includes(localDayOfWeek(unitStart, context.timezone))
      ) {
        // 06-B08 fast path: Friday/Saturday count as holiday-weekend.
        lines.push({ kind: 'HOLIDAY', adjustmentType: 'FLAT_PER_UNIT', amountMinor: 0 });
      }
    }
  }

  return {
    unitAmountMinor: baseMinor,
    totalMinor: roundMinorToPrecision(baseMinor * unitCount + total, 100),
    lines,
  };
}
