import { Injectable } from '@nestjs/common';
import type { VerifiedPrincipal } from '../ports/auth-provider.port';
import {
  ApplicationUserRecord,
  ApplicationUserStatus,
  IdentityStore,
} from '../ports/identity-store.port';

/**
 * Test-safe in-memory identity store.
 *
 * Used by unit/integration tests and by local development when the database
 * identity layer has not been wired yet. The Prisma-backed implementation
 * replaces it in 01-C without touching the port. Not for production truth.
 */
@Injectable()
export class InMemoryIdentityStore extends IdentityStore {
  private readonly bySubject = new Map<string, ApplicationUserRecord>();
  private sequence = 0;

  override findByProviderSubject(subject: string): Promise<ApplicationUserRecord | undefined> {
    return Promise.resolve(this.bySubject.get(subject));
  }

  override provisionFromPrincipal(principal: VerifiedPrincipal): Promise<ApplicationUserRecord> {
    const existing = this.bySubject.get(principal.subject);
    if (existing) {
      return Promise.resolve(existing);
    }
    this.sequence += 1;
    const record: ApplicationUserRecord = {
      userId: `user-${this.sequence}`,
      status: 'ACTIVE',
      email: principal.email ?? null,
      emailVerified: principal.emailVerified,
    };
    this.bySubject.set(principal.subject, record);
    return Promise.resolve(record);
  }

  /** Test/demo helper: mutate application-level lifecycle state. */
  setStatus(subject: string, status: ApplicationUserStatus): void {
    const record = this.bySubject.get(subject);
    if (record) {
      this.bySubject.set(subject, { ...record, status });
    }
  }
}
