import { Inject, Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import type { AppEnv } from '@kavriqo/config';
import { APP_ENV } from '../../config/app-env.token';
import { AuthFailureError, AuthProvider, VerifiedPrincipal } from '../ports/auth-provider.port';

/**
 * Supabase Auth verification boundary (01-B02).
 *
 * Verifies bearer access tokens with the provider's published signing keys
 * (JWKS, RS256), enforcing issuer and audience. This is the ONLY place
 * Supabase token semantics exist; everything downstream sees the
 * provider-neutral {@link VerifiedPrincipal}.
 *
 * Failure behavior (fail-closed):
 * - missing/malformed/bad-signature/claim failures → 401 codes;
 * - JWKS endpoint unreachable (and no cached keys) → PROVIDER_UNAVAILABLE
 *   (503) so provider outages degrade controlled instead of mis-verifying;
 * - provider metadata (role claims, app_metadata…) is deliberately NOT
 *   exported: authorization is never derived from provider claims.
 */
@Injectable()
export class SupabaseAuthProvider extends AuthProvider {
  override readonly providerId = 'supabase';
  override readonly capabilities = {
    emailPassword: true,
    emailVerification: true,
    passwordRecovery: true,
    mfa: true,
    accountLifecycleSignals: false,
  };

  private readonly logger = new Logger('SupabaseAuth');
  private readonly issuer?: string;
  private readonly audience: string;
  private readonly getKey: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    super();
    this.audience = env.SUPABASE_JWT_AUDIENCE;
    this.issuer =
      env.SUPABASE_JWT_ISSUER ?? (env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1` : undefined);

    const jwksUrl =
      env.SUPABASE_JWKS_URL ??
      (env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json` : undefined);

    if (!jwksUrl || !this.issuer) {
      this.logger.error(
        'Supabase Auth is not configured (SUPABASE_URL/SUPABASE_JWKS_URL missing); all token verification will fail closed with PROVIDER_UNAVAILABLE.',
      );
      return;
    }

    this.getKey = createRemoteJWKSet(new URL(jwksUrl), {
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
  }

  override async verifyAccessToken(token: string): Promise<VerifiedPrincipal> {
    if (!this.getKey || !this.issuer) {
      throw new AuthFailureError('PROVIDER_UNAVAILABLE', 'Identity provider is not configured.');
    }
    try {
      const { payload } = await jwtVerify(token, this.getKey, {
        issuer: this.issuer,
        audience: this.audience,
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new AuthFailureError('TOKEN_INVALID', 'Token has no subject.');
      }
      if (
        payload.aal !== undefined &&
        payload.aal !== 'aal1' &&
        payload.aal !== 'aal2' &&
        payload.aal !== 'aal3'
      ) {
        throw new AuthFailureError(
          'TOKEN_INVALID',
          'Token has an invalid authenticator assurance level.',
        );
      }

      return {
        subject: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        emailVerified: payload.email_verified === true,
        aal: payload.aal,
        sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
        issuedAt: typeof payload.iat === 'number' ? payload.iat : undefined,
      };
    } catch (error) {
      throw this.mapVerificationError(error);
    }
  }

  private mapVerificationError(error: unknown): AuthFailureError {
    if (error instanceof AuthFailureError) {
      return error;
    }
    if (error instanceof joseErrors.JWTExpired) {
      return new AuthFailureError('TOKEN_EXPIRED', 'Access token has expired.');
    }
    if (
      error instanceof joseErrors.JWTClaimValidationFailed ||
      error instanceof joseErrors.JWSSignatureVerificationFailed ||
      error instanceof joseErrors.JWTInvalid ||
      error instanceof SyntaxError
    ) {
      return new AuthFailureError('TOKEN_INVALID', 'Access token failed verification.');
    }
    // JWKS fetch failures and any other transport-level error: controlled
    // provider outage, never a mis-verification.
    return new AuthFailureError(
      'PROVIDER_UNAVAILABLE',
      'Identity provider is temporarily unavailable.',
    );
  }
}
