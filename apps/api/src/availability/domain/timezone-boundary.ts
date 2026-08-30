/**
 * Timezone conversion boundary (04-A05).
 *
 * ## Boundary rule
 *
 * Every availability/booking timestamp is an **instant**. Storage, conflict
 * math and queries use UTC instants only; wall-clock ("10:00 at the Oran
 * branch") exists exclusively at the boundaries:
 *
 * - IN (requests): clients either send an ISO-8601 timestamp with an
 *   explicit offset (converted to UTC), or a naive wall-clock datetime
 *   paired with an explicit IANA time zone (`zonedWallTimeToUtc`). A
 *   zone-less naive datetime is ambiguous and is rejected.
 * - OUT (responses): instants are serialized in UTC; converting to the
 *   tenant/user zone for display is a presentation concern that must never
 *   feed back into an availability decision.
 *
 * `formatInZone` exists only for presentation; availability code must not
 * branch on its output.
 */

export function isIsoWithOffset(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

/** ISO-8601 instant with explicit offset/Z → UTC Date, or null when invalid. */
export function parseUtcInstant(value: string): Date | null {
  if (!isIsoWithOffset(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function toIsoUtc(instant: Date): string {
  return instant.toISOString();
}

const WALL_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function offsetMsAt(instant: Date, timeZone: string): number | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string): number | null => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : null;
  };
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  if (year === null || month === null || day === null || hour === null || minute === null) {
    return null;
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second ?? 0);
  return asUtc - instant.getTime();
}

/** Wall-clock "HH:mm" of an instant in a zone, or null when unresolvable. */
function wallClockOf(instant: Date, timeZone: string): string | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  if (hour === undefined || minute === undefined) {
    return null;
  }
  return `${hour}:${minute}`;
}

/**
 * Naive wall-clock datetime + IANA time zone → UTC instant.
 *
 * Two-pass offset resolution handles DST transitions. Semantics are explicit:
 *
 * - **Ambiguous wall times** (fall-back hour, occurring twice) resolve to the
 *   **earlier** occurrence — detected by measuring the offset shift across the
 *   window and jumping back by it (supports 30/60-minute DST shifts).
 * - **Nonexistent wall times** (spring-forward gap) are **rejected** (null) —
 *   the caller must provide a valid instant rather than a guessed one.
 */
export function zonedWallTimeToUtc(wallTime: string, timeZone: string): Date | null {
  if (!WALL_TIME_PATTERN.test(wallTime) || !isKnownTimeZone(timeZone)) {
    return null;
  }

  const naive = new Date(`${wallTime}Z`);
  if (Number.isNaN(naive.getTime())) {
    return null;
  }

  let offset = offsetMsAt(naive, timeZone);
  if (offset === null) {
    return null;
  }
  const adjusted = new Date(naive.getTime() - offset);
  offset = offsetMsAt(adjusted, timeZone);
  if (offset === null) {
    return null;
  }
  let resolved = new Date(naive.getTime() - offset);

  const targetClock = wallTime.slice(11);

  // Reject wall times that do not exist in this zone (spring-forward gap).
  if (wallClockOf(resolved, timeZone) !== targetClock) {
    return null;
  }

  // Ambiguous fall-back wall times: resolve to the earlier occurrence.
  const offsetBefore = offsetMsAt(new Date(resolved.getTime() - 3 * 60 * 60 * 1000), timeZone);
  const offsetAfter = offsetMsAt(resolved, timeZone);
  if (offsetBefore !== null && offsetAfter !== null) {
    const shift = offsetBefore - offsetAfter;
    if (shift > 0) {
      const earlier = new Date(resolved.getTime() - shift);
      if (wallClockOf(earlier, timeZone) === targetClock) {
        resolved = earlier;
      }
    }
  }

  return resolved;
}

/**
 * PRESENTATION ONLY: format an instant in a zone/locale for display.
 * Never use the result in availability/conflict logic.
 */
export function formatInZone(instant: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(instant);
}
