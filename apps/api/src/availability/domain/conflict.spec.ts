import { isValidBlockTransition } from './blocks';
import {
  blockStatusConflicts,
  commitmentsConflict,
  CONFLICTING_BLOCK_STATUSES,
  CONFLICTING_HOLD_STATUSES,
  holdStatusConflicts,
} from './conflict';

/**
 * Conflict protection rules (04-B01): which statuses actively conflict, and
 * the commitment-level conflict predicate.
 */
describe('conflicting statuses', () => {
  it('blocks conflict only in SCHEDULED or ACTIVE status', () => {
    expect(CONFLICTING_BLOCK_STATUSES).toEqual(['SCHEDULED', 'ACTIVE']);
    expect(blockStatusConflicts('SCHEDULED')).toBe(true);
    expect(blockStatusConflicts('ACTIVE')).toBe(true);
    expect(blockStatusConflicts('COMPLETED')).toBe(false);
    expect(blockStatusConflicts('CANCELLED')).toBe(false);
  });

  it('holds conflict only while ACTIVE', () => {
    expect(CONFLICTING_HOLD_STATUSES).toEqual(['ACTIVE']);
    expect(holdStatusConflicts('ACTIVE')).toBe(true);
    expect(holdStatusConflicts('EXPIRED')).toBe(false);
    expect(holdStatusConflicts('RELEASED')).toBe(false);
    expect(holdStatusConflicts('CONSUMED')).toBe(false);
  });
});

describe('commitmentsConflict', () => {
  const a = { start: new Date('2026-09-01T08:00:00Z'), end: new Date('2026-09-01T12:00:00Z'), status: 'ACTIVE' };
  const isConflicting = holdStatusConflicts;

  it('conflicts when both are active and overlapping', () => {
    const b = { start: new Date('2026-09-01T10:00:00Z'), end: new Date('2026-09-01T14:00:00Z'), status: 'ACTIVE' };
    expect(commitmentsConflict(a, b, isConflicting)).toBe(true);
  });

  it('does not conflict when either side is inert', () => {
    const expired = { ...a, status: 'EXPIRED' };
    expect(commitmentsConflict(a, expired, isConflicting)).toBe(false);
    expect(commitmentsConflict(expired, a, isConflicting)).toBe(false);
  });

  it('does not conflict for back-to-back intervals', () => {
    const b = { start: a.end, end: new Date('2026-09-01T16:00:00Z'), status: 'ACTIVE' };
    expect(commitmentsConflict(a, b, isConflicting)).toBe(false);
  });
});

describe('block lifecycle transitions (04-A02)', () => {
  it('allows the documented forward transitions', () => {
    expect(isValidBlockTransition('SCHEDULED', 'ACTIVE')).toBe(true);
    expect(isValidBlockTransition('SCHEDULED', 'COMPLETED')).toBe(true);
    expect(isValidBlockTransition('SCHEDULED', 'CANCELLED')).toBe(true);
    expect(isValidBlockTransition('ACTIVE', 'COMPLETED')).toBe(true);
    expect(isValidBlockTransition('ACTIVE', 'CANCELLED')).toBe(true);
  });

  it('rejects terminal and backward transitions', () => {
    expect(isValidBlockTransition('COMPLETED', 'SCHEDULED')).toBe(false);
    expect(isValidBlockTransition('CANCELLED', 'ACTIVE')).toBe(false);
    expect(isValidBlockTransition('ACTIVE', 'SCHEDULED')).toBe(false);
  });
});
