import type { RoleValue } from '../roles';

/**
 * Agency membership store port (01-D03).
 *
 * The database-backed implementation lands with 02-B (memberships
 * migration + role assignment); authorization consumes this contract from
 * Phase 01 so no client-supplied role/tenant is ever trusted.
 */
export interface MembershipRecord {
  userId: string;
  agencyId: string;
  role: RoleValue;
  /** Application-side membership lifecycle (02-B03). */
  status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
}

export abstract class MembershipStore {
  /** All memberships of a user that are currently effective. */
  abstract findForUser(userId: string): Promise<MembershipRecord[]>;

  /** Effective membership of a user in a specific agency (undefined if none). */
  abstract findForUserInAgency(
    userId: string,
    agencyId: string,
  ): Promise<MembershipRecord | undefined>;
}
