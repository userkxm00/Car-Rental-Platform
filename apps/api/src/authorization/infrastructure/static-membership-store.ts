import { Injectable } from '@nestjs/common';
import { MembershipRecord, MembershipStore } from '../ports/membership.store';

/**
 * Static (empty) membership store.
 *
 * Until agencies/memberships exist (02-A/02-B), the platform has no
 * memberships — this implementation truthfully reports none, so every
 * agency-scoped authorization decision denies. Tests inject their own
 * implementations; the database-backed store replaces this in 02-B.
 */
@Injectable()
export class StaticMembershipStore extends MembershipStore {
  override findForUser(_userId: string): Promise<MembershipRecord[]> {
    return Promise.resolve([]);
  }

  override findForUserInAgency(
    _userId: string,
    _agencyId: string,
  ): Promise<MembershipRecord | undefined> {
    return Promise.resolve(undefined);
  }
}
