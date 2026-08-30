/**
 * Availability interval semantics (04-A01).
 *
 * ONE authoritative interval model for every time-bounded commitment:
 * reservations, active rentals, operational blocks, holds and transfers.
 *
 * ## Semantics (defined once, used everywhere)
 *
 * - Intervals are **half-open**: `[start, end)`. `start` is the inclusive
 *   instant the vehicle becomes unavailable; `end` is the exclusive instant
 *   availability resumes. A return at 10:00 and a pickup at 10:00 are
 *   back-to-back, not conflicting.
 * - `start` and `end` are **UTC instants** (`Date`). All conflict and
 *   availability math happens on instants; converting them into a tenant or
 *   user wall-clock zone is a presentation concern (see 04-A05).
 * - A valid interval has a strictly positive duration (`end > start`).
 * - Two intervals **overlap** iff `a.start < b.end && b.start < a.end`.
 *   Touching boundaries never conflict.
 *
 * These rules mirror `architecture/availability-engine.md` (conflict rule,
 * buffer time) and are the contract the exclusion constraints in 04-B and
 * every availability query in 04-C must implement.
 */

export const AvailabilityErrorCode = {
  INVALID_INTERVAL: 'INVALID_INTERVAL',
  INTERVAL_CONFLICT: 'INTERVAL_CONFLICT',
} as const;

export type AvailabilityErrorCodeValue = (typeof AvailabilityErrorCode)[keyof typeof AvailabilityErrorCode];

export interface AvailabilityInterval {
  start: Date;
  end: Date;
}

export interface IntervalFailure {
  field: 'start' | 'end' | 'interval';
  reason: string;
}

/** Validates the shared interval contract; returns failures (never throws). */
export function validateInterval(start: Date, end: Date): IntervalFailure[] {
  const failures: IntervalFailure[] = [];

  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    failures.push({ field: 'start', reason: 'start must be a valid date' });
  }
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
    failures.push({ field: 'end', reason: 'end must be a valid date' });
  }
  if (failures.length > 0) {
    return failures;
  }

  if (end.getTime() <= start.getTime()) {
    failures.push({ field: 'interval', reason: 'end must be strictly after start' });
  }

  return failures;
}

export function isValidInterval(start: Date, end: Date): boolean {
  return validateInterval(start, end).length === 0;
}

/**
 * Half-open overlap test: true when the two intervals share any instant.
 * `[08:00, 10:00)` and `[10:00, 12:00)` do NOT overlap.
 */
export function overlaps(a: AvailabilityInterval, b: AvailabilityInterval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** True when `candidate` is fully contained in `outer` (half-open). */
export function contains(outer: AvailabilityInterval, candidate: AvailabilityInterval): boolean {
  return (
    outer.start.getTime() <= candidate.start.getTime() &&
    candidate.end.getTime() <= outer.end.getTime()
  );
}

export function intervalDurationMs(interval: AvailabilityInterval): number {
  return interval.end.getTime() - interval.start.getTime();
}
