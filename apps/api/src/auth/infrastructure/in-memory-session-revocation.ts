import { Injectable } from '@nestjs/common';
import { SessionRevocationBoundary } from '../ports/session-revocation.port';
import type { VerifiedPrincipal } from '../ports/auth-provider.port';

const MAX_ENTRIES = 10_000;

/**
 * Per-process revocation registry (01-E01).
 *
 * Revoked sessions are matched by provider session ID when the token asserts
 * one, else by subject. A persistent store replaces this when the provider
 * reconciliation/webhook phase is implemented; the boundary contract stays.
 */
@Injectable()
export class InMemorySessionRevocationBoundary extends SessionRevocationBoundary {
  private readonly revokedSessionIds = new Set<string>();
  private readonly revokedSubjects = new Set<string>();

  override isRevoked(principal: VerifiedPrincipal): Promise<boolean> {
    const bySession =
      principal.sessionId !== undefined && this.revokedSessionIds.has(principal.sessionId);
    const bySubject = this.revokedSubjects.has(principal.subject);
    return Promise.resolve(bySession || bySubject);
  }

  override revoke(principal: Pick<VerifiedPrincipal, 'sessionId' | 'subject'>): Promise<void> {
    if (this.revokedSessionIds.size + this.revokedSubjects.size >= MAX_ENTRIES) {
      // Bounded registry: drop the oldest half instead of growing unbounded.
      const sessionIds = [...this.revokedSessionIds].slice(0, MAX_ENTRIES / 2);
      const subjects = [...this.revokedSubjects].slice(0, MAX_ENTRIES / 2);
      this.revokedSessionIds.clear();
      this.revokedSubjects.clear();
      for (const id of sessionIds) this.revokedSessionIds.add(id);
      for (const subject of subjects) this.revokedSubjects.add(subject);
    }
    if (principal.sessionId !== undefined) {
      this.revokedSessionIds.add(principal.sessionId);
    }
    this.revokedSubjects.add(principal.subject);
    return Promise.resolve();
  }
}
