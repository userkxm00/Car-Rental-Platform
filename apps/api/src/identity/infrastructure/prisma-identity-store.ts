import { Injectable } from '@nestjs/common';
import type { VerifiedPrincipal } from '../../auth/ports/auth-provider.port';
import { ApplicationUserRecord, IdentityStore } from '../../auth/ports/identity-store.port';
import { UserRepository } from './user.repository';

/**
 * Database-backed identity store (01-C03).
 *
 * Replaces the transitional in-memory store behind the same {@link IdentityStore}
 * port — the auth boundary is unchanged; only persistence moved to
 * PostgreSQL via the users/user_identities schema (01-C01).
 */
@Injectable()
export class PrismaIdentityStore extends IdentityStore {
  constructor(private readonly users: UserRepository) {
    super();
  }

  override findByProviderSubject(subject: string): Promise<ApplicationUserRecord | undefined> {
    return this.users.findByProviderSubject(subject);
  }

  override provisionFromPrincipal(principal: VerifiedPrincipal): Promise<ApplicationUserRecord> {
    return this.users.provisionFromPrincipal(principal);
  }
}
