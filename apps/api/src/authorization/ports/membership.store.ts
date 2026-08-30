import type { RoleValue } from '../roles';

/**
 * Agency membership store port (01-D03, refined 02-B).
 *
 * A membership carries one or more agency roles (membership_roles). The
 * database-backed implementation lives in the memberships module (02-B);
 * authorization consumes this contract so no client-supplied role/tenant is
 * ever trusted.
 */
export interface MembershipRecord {
  userId: string;
  agencyId: string;
  roles: RoleValue[];
  /** Application-side membership lifecycle (02-B03). */
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DECLINED' | 'REMOVED';
}

export abstract class MembershipStore {
  /** All memberships of a user (any status, for lifecycle visibility). */
  abstract findForUser(userId: string): Promise<MembershipRecord[]>;

  /** Effective membership of a user in a specific agency (undefined if none). */
  abstract findForUserInAgency(
    userId: string,
    agencyId: string,
  ): Promise<MembershipRecord | undefined>;
}
