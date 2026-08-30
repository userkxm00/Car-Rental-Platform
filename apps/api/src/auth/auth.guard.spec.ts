import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, IS_PUBLIC_KEY } from './auth.guard';
import { AuthFailureError, AuthProvider, VerifiedPrincipal } from './ports/auth-provider.port';
import { SessionRevocationBoundary } from './ports/session-revocation.port';
import { AuthRequest } from './auth-principal';

class NoopRevocationBoundary extends SessionRevocationBoundary {
  override isRevoked(_principal: VerifiedPrincipal): Promise<boolean> {
    return Promise.resolve(false);
  }

  override revoke(_principal: Pick<VerifiedPrincipal, 'sessionId' | 'subject'>): Promise<void> {
    return Promise.resolve();
  }
}

const principal: VerifiedPrincipal = { subject: 'sub-1', emailVerified: true };

class FakeAuthProvider extends AuthProvider {
  override readonly providerId = 'test';
  override readonly capabilities = {
    emailPassword: true,
    emailVerification: true,
    passwordRecovery: true,
    mfa: true,
    accountLifecycleSignals: true,
  };

  constructor(
    private readonly behavior:
      { kind: 'ok' } | { kind: 'failure'; code: AuthFailureError['code'] } = { kind: 'ok' },
  ) {
    super();
  }

  override verifyAccessToken(_token: string): Promise<VerifiedPrincipal> {
    if (this.behavior.kind === 'failure') {
      throw new AuthFailureError(this.behavior.code, 'test failure');
    }
    return Promise.resolve(principal);
  }
}

function executionContext(headers: Record<string, string | undefined> = {}): {
  context: ExecutionContext;
  request: AuthRequest;
} {
  const request = { headers } as AuthRequest;
  const context = {
    getType: () => 'http',
    getHandler: () => function handler(): void {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function makeGuard(
  provider: AuthProvider,
  reflectorValues: unknown[] = [],
): { guard: AuthGuard; getAllAndOverride: jest.Mock } {
  const getAllAndOverride = jest.fn().mockReturnValue(reflectorValues[0]);
  const reflector = { getAllAndOverride } as unknown as Reflector;
  return {
    guard: new AuthGuard(provider, reflector, new NoopRevocationBoundary()),
    getAllAndOverride,
  };
}

describe('AuthGuard', () => {
  it('grants access for a valid bearer token and attaches the principal', async () => {
    const { guard } = makeGuard(new FakeAuthProvider({ kind: 'ok' }));
    const { context, request } = executionContext({ authorization: 'Bearer valid-token' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authPrincipal?.subject).toBe('sub-1');
  });

  it('rejects requests without an Authorization header (401 UNAUTHORIZED)', async () => {
    const { guard } = makeGuard(new FakeAuthProvider());
    const { context } = executionContext({});
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      constructor: UnauthorizedException,
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('rejects non-Bearer schemes', async () => {
    const { guard } = makeGuard(new FakeAuthProvider());
    const { context } = executionContext({ authorization: 'Basic abc' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects empty bearer tokens', async () => {
    const { guard } = makeGuard(new FakeAuthProvider());
    const { context } = executionContext({ authorization: 'Bearer   ' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'UNAUTHORIZED' },
    });
  });

  it('maps TOKEN_EXPIRED and TOKEN_INVALID to 401 with stable codes', async () => {
    for (const code of ['TOKEN_EXPIRED', 'TOKEN_INVALID'] as const) {
      const { guard } = makeGuard(new FakeAuthProvider({ kind: 'failure', code }));
      const { context } = executionContext({ authorization: 'Bearer x' });
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        response: { code },
      });
    }
  });

  it('maps PROVIDER_UNAVAILABLE to 503 instead of denying with 401', async () => {
    const { guard } = makeGuard(
      new FakeAuthProvider({ kind: 'failure', code: 'PROVIDER_UNAVAILABLE' }),
    );
    const { context } = executionContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
      response: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });

  it('never attaches a principal on verification failure (fail-closed)', async () => {
    const { guard } = makeGuard(new FakeAuthProvider({ kind: 'failure', code: 'TOKEN_INVALID' }));
    const { context, request } = executionContext({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.authPrincipal).toBeUndefined();
  });

  it('rejects a verified-but-revoked session with 401 TOKEN_REVOKED', async () => {
    const provider = new FakeAuthProvider({ kind: 'ok' });
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    const revocation = {
      isRevoked: (_principal: VerifiedPrincipal) => Promise.resolve(true),
      revoke: () => Promise.resolve(),
    } as unknown as SessionRevocationBoundary;
    const guard = new AuthGuard(provider, reflector, revocation);
    const { context } = executionContext({ authorization: 'Bearer valid-token' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'TOKEN_REVOKED' },
    });
  });

  it('skips verification for @Public routes', async () => {
    const provider = new FakeAuthProvider({ kind: 'ok' });
    const verifySpy = jest.spyOn(provider, 'verifyAccessToken');
    const { guard, getAllAndOverride } = makeGuard(provider, [true]);
    const { context } = executionContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifySpy).not.toHaveBeenCalled();
    expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, expect.anything());
  });
});
