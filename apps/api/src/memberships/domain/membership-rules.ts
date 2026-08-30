/**
 * Membership domain rules (02-B).
 */
export const MembershipErrorCode = {
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  MEMBERSHIP_EXISTS: 'MEMBERSHIP_EXISTS',
  INVALID_ROLE: 'INVALID_ROLE',
  INVALID_MEMBERSHIP_TRANSITION: 'INVALID_MEMBERSHIP_TRANSITION',
  TENANT_NOT_ACTIVE: 'TENANT_NOT_ACTIVE',
  MEMBERSHIP_VALIDATION_FAILED: 'MEMBERSHIP_VALIDATION_FAILED',
} as const;

export type MembershipErrorCodeValue =
  (typeof MembershipErrorCode)[keyof typeof MembershipErrorCode];

export type MembershipStatusValue = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DECLINED' | 'REMOVED';

/**
 * Membership status transitions (02-B03):
 * INVITED → ACTIVE (accept) | DECLINED | REMOVED (revoked invitation);
 * ACTIVE → SUSPENDED | REMOVED; SUSPENDED → ACTIVE | REMOVED;
 * DECLINED → INVITED (re-invite) | REMOVED; REMOVED is terminal.
 */
export const MEMBERSHIP_TRANSITIONS: Readonly<
  Record<MembershipStatusValue, readonly MembershipStatusValue[]>
> = {
  INVITED: ['ACTIVE', 'DECLINED', 'REMOVED'],
  ACTIVE: ['SUSPENDED', 'REMOVED'],
  SUSPENDED: ['ACTIVE', 'REMOVED'],
  DECLINED: ['INVITED', 'REMOVED'],
  REMOVED: [],
};

export function canTransitionMembership(
  from: MembershipStatusValue,
  to: MembershipStatusValue,
): boolean {
  return MEMBERSHIP_TRANSITIONS[from].includes(to);
}
