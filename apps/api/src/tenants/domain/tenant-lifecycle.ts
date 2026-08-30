import { TenantStatus, TenantVerificationStatus } from '@prisma/client';

/**
 * Tenant lifecycle rules (02-A03/02-A07).
 *
 * Status transitions are versioned domain rules: the service rejects any
 * transition not declared here, and the repository applies them atomically.
 */

export const TENANT_STATUS_TRANSITIONS: Readonly<Record<TenantStatus, readonly TenantStatus[]>> = {
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE'],
  ARCHIVED: [],
};

/**
 * Verification flow: UNVERIFIED → PENDING → VERIFIED | REJECTED;
 * REJECTED → PENDING (re-review). VERIFIED is terminal unless the platform
 * re-opens review (VERIFIED → PENDING).
 */
export const VERIFICATION_TRANSITIONS: Readonly<
  Record<TenantVerificationStatus, readonly TenantVerificationStatus[]>
> = {
  UNVERIFIED: ['PENDING'],
  PENDING: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['PENDING'],
  REJECTED: ['PENDING'],
};

export function canTransitionStatus(from: TenantStatus, to: TenantStatus): boolean {
  return TENANT_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionVerification(
  from: TenantVerificationStatus,
  to: TenantVerificationStatus,
): boolean {
  return VERIFICATION_TRANSITIONS[from].includes(to);
}
