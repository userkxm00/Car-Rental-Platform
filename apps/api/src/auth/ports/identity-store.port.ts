import type { VerifiedPrincipal } from './auth-provider.port';

/**
 * Application identity store port (01-B03 / 01-B04 / 01-B05).
 *
 * The single boundary between authentication and the application's own user
 * identity. Provider subjects are mapped to application user IDs here; the
 * database-backed implementation arrives with the users migration in 01-C
 * (Prisma) and replaces the in-memory test implementation without changing
 * this contract.
 *
 * Declared as an abstract class so it doubles as a NestJS DI token.
 */

export type ApplicationUserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface ApplicationUserRecord {
  userId: string;
  status: ApplicationUserStatus;
  email: string | null;
  emailVerified: boolean;
}

export abstract class IdentityStore {
  /** Resolve an application user by provider subject (unknown → undefined). */
  abstract findByProviderSubject(subject: string): Promise<ApplicationUserRecord | undefined>;

  /**
   * Provision an application user from verified claims. Implementations MUST
   * be idempotent per subject and MUST NOT accept authorization metadata.
   */
  abstract provisionFromPrincipal(principal: VerifiedPrincipal): Promise<ApplicationUserRecord>;
}
