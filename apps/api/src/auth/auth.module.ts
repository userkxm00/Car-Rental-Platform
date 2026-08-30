import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { InMemorySessionRevocationBoundary } from './infrastructure/in-memory-session-revocation';
import { SupabaseAuthProvider } from './infrastructure/supabase-auth-provider';
import { AuthProvider } from './ports/auth-provider.port';
import { SessionRevocationBoundary } from './ports/session-revocation.port';

/**
 * Authentication boundary module (01-B / 01-E01).
 *
 * Provides the provider verification boundary, the revocation boundary and
 * the global guard. Identity persistence/resolution lives in IdentityModule
 * (01-C), which supplies the {@link IdentityStore} implementation behind the
 * same port.
 */
@Global()
@Module({
  providers: [
    { provide: AuthProvider, useClass: SupabaseAuthProvider },
    { provide: SessionRevocationBoundary, useClass: InMemorySessionRevocationBoundary },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthProvider, SessionRevocationBoundary],
})
export class AuthModule {}
