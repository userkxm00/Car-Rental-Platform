import {
  contains,
  intervalDurationMs,
  isValidInterval,
  overlaps,
  validateInterval,
} from './interval';

/**
 * Reservation interval semantics (04-A01): half-open intervals in UTC.
 * These tests are the executable contract that 04-B conflict protection and
 * 04-C availability queries must honor.
 */
const at = (iso: string): Date => new Date(iso);

describe('interval validation', () => {
  it('accepts a half-open interval with a strictly positive duration', () => {
    expect(validateInterval(at('2026-09-01T08:00:00Z'), at('2026-09-01T10:00:00Z'))).toEqual([]);
    expect(isValidInterval(at('2026-09-01T08:00:00Z'), at('2026-09-01T10:00:00Z'))).toBe(true);
  });

  it('rejects a zero-length interval (start === end)', () => {
    const failures = validateInterval(at('2026-09-01T08:00:00Z'), at('2026-09-01T08:00:00Z'));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ field: 'interval' });
  });

  it('rejects an interval whose end precedes its start', () => {
    const failures = validateInterval(at('2026-09-02T08:00:00Z'), at('2026-09-01T10:00:00Z'));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ field: 'interval', reason: 'end must be strictly after start' });
  });

  it('rejects invalid date inputs with field-level failures', () => {
    const failures = validateInterval(new Date('nonsense'), at('2026-09-01T10:00:00Z'));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ field: 'start' });
  });
});

describe('overlap semantics (half-open)', () => {
  const a = { start: at('2026-09-01T08:00:00Z'), end: at('2026-09-01T10:00:00Z') };

  it('detects a partial overlap', () => {
    const b = { start: at('2026-09-01T09:00:00Z'), end: at('2026-09-01T11:00:00Z') };
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it('detects full containment as overlap', () => {
    const b = { start: at('2026-09-01T08:30:00Z'), end: at('2026-09-01T09:30:00Z') };
    expect(overlaps(a, b)).toBe(true);
  });

  it('does NOT treat back-to-back intervals as overlapping (return at 10:00, pickup at 10:00)', () => {
    const b = { start: at('2026-09-01T10:00:00Z'), end: at('2026-09-01T12:00:00Z') };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  it('does NOT overlap a fully separated interval', () => {
    const b = { start: at('2026-09-01T11:00:00Z'), end: at('2026-09-01T12:00:00Z') };
    expect(overlaps(a, b)).toBe(false);
  });

  it('is symmetric for identical intervals', () => {
    expect(overlaps(a, { ...a })).toBe(true);
  });
});

describe('containment and duration helpers', () => {
  it('recognizes an interval fully contained in another (half-open)', () => {
    const outer = { start: at('2026-09-01T08:00:00Z'), end: at('2026-09-02T08:00:00Z') };
    expect(contains(outer, { start: at('2026-09-01T08:00:00Z'), end: at('2026-09-02T08:00:00Z') })).toBe(true);
    expect(contains(outer, { start: at('2026-09-01T12:00:00Z'), end: at('2026-09-01T18:00:00Z') })).toBe(true);
    expect(contains(outer, { start: at('2026-09-02T08:00:00Z'), end: at('2026-09-02T09:00:00Z') })).toBe(false);
  });

  it('computes duration in milliseconds', () => {
    expect(
      intervalDurationMs({ start: at('2026-09-01T08:00:00Z'), end: at('2026-09-01T10:00:00Z') }),
    ).toBe(2 * 60 * 60 * 1000);
  });
});
