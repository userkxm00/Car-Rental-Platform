import type { VerifiedPrincipal } from './auth-provider.port';

/**
 * Session invalidation/revocation boundary (01-E01).
 *
 * Provider-side revocation (sign-out, session deletion) is observed
 * passively: the next token verification fails and the request is rejected.
 * This boundary adds the application-side signal path — sessions the
 * platform knows to be revoked are rejected even while the provider token
 * still verifies. The Phase 01 implementation is a per-process registry;
 * a persistent/webhook-fed store replaces it when the provider
 * reconciliation phase lands (see architecture/auth-flow-contracts.md §6).
 */
export abstract class SessionRevocationBoundary {
  /** True when the session behind a verified principal is revoked. */
  abstract isRevoked(principal: VerifiedPrincipal): Promise<boolean>;

  /** Record a revoked session (used by revocation flows and tests). */
  abstract revoke(principal: Pick<VerifiedPrincipal, 'sessionId' | 'subject'>): Promise<void>;
}
