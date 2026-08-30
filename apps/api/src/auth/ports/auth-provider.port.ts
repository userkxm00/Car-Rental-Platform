/**
 * Authentication provider port (01-B01).
 *
 * The application trusts exactly one thing from an external identity
 * provider: a signature-verified access token. Provider-specific SDKs,
 * identifiers and metadata never cross this boundary into domain code.
 *
 * Authorization is NEVER derived from provider claims (see docs/36 and
 * architecture/authentication-authorization.md); claims feed identity
 * mapping only.
 *
 * Declared as an abstract class so it doubles as a NestJS DI token.
 */

/** Capabilities a concrete provider implementation supports. */
export interface AuthCapabilities {
  emailPassword: boolean;
  emailVerification: boolean;
  passwordRecovery: boolean;
  mfa: boolean;
  /** Whether provider user deletion/disablement is externally observable. */
  accountLifecycleSignals: boolean;
}

/**
 * Claims extracted from a verified access token. Field presence follows the
 * provider's token shape; every field is provider-verified, none of it is
 * authorization.
 */
export interface VerifiedPrincipal {
  /** Stable provider subject (e.g. Supabase user UUID). Opaque to the domain. */
  subject: string;
  /** Verified email, when the provider asserts one. */
  email?: string;
  /** Provider-asserted verification state of `email`. */
  emailVerified: boolean;
  /** Authenticator assurance level (Supabase `aal`), when asserted. */
  aal?: 'aal1' | 'aal2' | 'aal3';
  /** Provider session ID, when asserted (used for revocation correlation). */
  sessionId?: string;
  /** Token issue time (epoch seconds), when asserted. */
  issuedAt?: number;
}

/** Fail-closed authentication error taxonomy (stable API codes). */
export type AuthFailureCode =
  'TOKEN_MISSING' | 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED' | 'PROVIDER_UNAVAILABLE';

export class AuthFailureError extends Error {
  readonly code: AuthFailureCode;

  constructor(code: AuthFailureCode, message: string) {
    super(message);
    this.name = 'AuthFailureError';
    this.code = code;
  }
}

export abstract class AuthProvider {
  abstract readonly providerId: 'supabase' | 'test' | (string & {});
  abstract readonly capabilities: AuthCapabilities;

  /**
   * Verifies a bearer access token. Throws {@link AuthFailureError} with a
   * stable code on any failure; never returns a principal for an unverified
   * token.
   */
  abstract verifyAccessToken(token: string): Promise<VerifiedPrincipal>;
}
