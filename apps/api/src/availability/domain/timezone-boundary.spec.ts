import {
  formatInZone,
  isIsoWithOffset,
  parseUtcInstant,
  toIsoUtc,
  zonedWallTimeToUtc,
} from './timezone-boundary';

/**
 * Timezone conversion boundary (04-A05): instants in, instants out.
 */
describe('parseUtcInstant', () => {
  it('normalizes ISO-8601 timestamps with offsets to the same UTC instant', () => {
    expect(toIsoUtc(parseUtcInstant('2026-09-01T09:00:00+01:00')!)).toBe('2026-09-01T08:00:00.000Z');
    expect(toIsoUtc(parseUtcInstant('2026-09-01T08:00:00Z')!)).toBe('2026-09-01T08:00:00.000Z');
  });

  it('rejects zone-less naive datetimes (ambiguous) and garbage', () => {
    expect(parseUtcInstant('2026-09-01T08:00:00')).toBeNull();
    expect(parseUtcInstant('not a date')).toBeNull();
    expect(isIsoWithOffset('2026-09-01T08:00:00')).toBe(false);
  });

  it('rejects invalid calendar values', () => {
    expect(parseUtcInstant('2026-13-40T08:00:00Z')).toBeNull();
  });
});

describe('zonedWallTimeToUtc', () => {
  it('converts a wall-clock time in an explicit zone to a UTC instant', () => {
    // Algiers is UTC+1 year-round.
    const instant = zonedWallTimeToUtc('2026-09-01T09:00', 'Africa/Algiers');
    expect(toIsoUtc(instant!)).toBe('2026-09-01T08:00:00.000Z');
  });

  it('accounts for DST in zones that observe it', () => {
    // Europe/Paris: 2026-07-15 is CEST (UTC+2); 2026-01-15 is CET (UTC+1).
    expect(toIsoUtc(zonedWallTimeToUtc('2026-07-15T10:00', 'Europe/Paris')!)).toBe('2026-07-15T08:00:00.000Z');
    expect(toIsoUtc(zonedWallTimeToUtc('2026-01-15T10:00', 'Europe/Paris')!)).toBe('2026-01-15T09:00:00.000Z');
  });

  it('rejects unknown time zones and malformed wall times', () => {
    expect(zonedWallTimeToUtc('2026-09-01T09:00', 'Mars/Olympus')).toBeNull();
    expect(zonedWallTimeToUtc('2026-09-01T09:00:00', 'Africa/Algiers')).toBeNull();
    expect(zonedWallTimeToUtc('09:00', 'Africa/Algiers')).toBeNull();
  });

  it('resolves ambiguous fall-back wall times to the earlier occurrence', () => {
    // Europe/Paris falls back 2026-10-25 03:00 CEST → 02:00 CET (01:00Z):
    // wall time 02:30 occurs at 00:30Z (CEST) and 01:30Z (CET).
    const instant = zonedWallTimeToUtc('2026-10-25T02:30', 'Europe/Paris');
    expect(instant).not.toBeNull();
    expect(toIsoUtc(instant!)).toBe('2026-10-25T00:30:00.000Z');
  });

  it('rejects wall times that do not exist (spring-forward gap)', () => {
    // Europe/Paris springs forward 2026-03-29 02:00 → 03:00 CET→CEST: 02:30 never exists.
    expect(zonedWallTimeToUtc('2026-03-29T02:30', 'Europe/Paris')).toBeNull();
  });
});

describe('formatInZone (presentation only)', () => {
  it('formats an instant in the requested zone and locale', () => {
    const instant = parseUtcInstant('2026-09-01T08:00:00Z')!;
    expect(formatInZone(instant, 'Africa/Algiers', 'en-US')).toContain('2026');
    // The boundary helper is display-only; the instant itself is untouched.
    expect(toIsoUtc(instant)).toBe('2026-09-01T08:00:00.000Z');
  });
});
