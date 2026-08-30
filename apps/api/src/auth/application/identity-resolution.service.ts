import { ForbiddenException, Injectable } from '@nestjs/common';
import type { VerifiedPrincipal } from '../ports/auth-provider.port';
import { IdentityStore } from '../ports/identity-store.port';

/**
 * Resolves a verified principal to an active application user (01-B03/04/05).
 *
 * - known subject → existing application identity;
 * - unknown subject → provisioning from verified claims only (idempotent);
 * - SUSPENDED/DEACTIVATED application identity → 403 USER_DISABLED. Provider
 *   deletion is observed as verification failure upstream (401); this layer
 *   handles application-level lifecycle state.
 *
 * Authorization (roles/permissions/tenant scope) is decided later, in 01-D,
 * and is never part of this resolution.
 */
@Injectable()
export class IdentityResolutionService {
  constructor(private readonly identityStore: IdentityStore) {}

  async resolve(principal: VerifiedPrincipal): Promise<string> {
    let record = await this.identityStore.findByProviderSubject(principal.subject);

    if (record === undefined) {
      record = await this.identityStore.provisionFromPrincipal(principal);
    }

    if (record.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'USER_DISABLED',
        message: 'This account is suspended or deactivated.',
      });
    }

    return record.userId;
  }
}
