import {
  canTransitionStatus,
  canTransitionVerification,
  TENANT_STATUS_TRANSITIONS,
  VERIFICATION_TRANSITIONS,
} from './tenant-lifecycle';
import { isValidTenantSlug } from './tenant-errors';

describe('Tenant lifecycle rules (02-A03/02-A07)', () => {
  it('allows ACTIVE → SUSPENDED and back', () => {
    expect(canTransitionStatus('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionStatus('SUSPENDED', 'ACTIVE')).toBe(true);
  });

  it('allows ACTIVE → ARCHIVED but never returns from ARCHIVED', () => {
    expect(canTransitionStatus('ACTIVE', 'ARCHIVED')).toBe(true);
    expect(canTransitionStatus('ARCHIVED', 'ACTIVE')).toBe(false);
    expect(canTransitionStatus('ARCHIVED', 'SUSPENDED')).toBe(false);
    expect(TENANT_STATUS_TRANSITIONS.ARCHIVED).toEqual([]);
  });

  it('verification flow: UNVERIFIED → PENDING → VERIFIED|REJECTED, with re-review', () => {
    expect(canTransitionVerification('UNVERIFIED', 'PENDING')).toBe(true);
    expect(canTransitionVerification('PENDING', 'VERIFIED')).toBe(true);
    expect(canTransitionVerification('PENDING', 'REJECTED')).toBe(true);
    expect(canTransitionVerification('REJECTED', 'PENDING')).toBe(true);
    expect(canTransitionVerification('VERIFIED', 'PENDING')).toBe(true);
    expect(VERIFICATION_TRANSITIONS.UNVERIFIED).toEqual(['PENDING']);
  });

  it('rejects jumps outside the declared flow', () => {
    expect(canTransitionVerification('UNVERIFIED', 'VERIFIED')).toBe(false);
    expect(canTransitionVerification('REJECTED', 'VERIFIED')).toBe(false);
    expect(canTransitionStatus('SUSPENDED', 'ARCHIVED')).toBe(false);
  });
});

describe('Tenant slug rules (02-A04)', () => {
  it.each(['kavriqo', 'alger-car', 'a1-b2-c3', 'abc-123'])('accepts %s', (slug) => {
    expect(isValidTenantSlug(slug)).toBe(true);
  });

  it.each([
    '',
    'ab',
    'x'.repeat(61),
    'UPPER',
    'has space',
    '-leading',
    'trailing-',
    'under_score',
    'héllo',
  ])('rejects %s', (slug) => {
    expect(isValidTenantSlug(slug)).toBe(false);
  });
});
