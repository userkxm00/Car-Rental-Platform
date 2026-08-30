import {
  AuthFailureError,
  AuthFailureCode,
  AuthProvider,
  VerifiedPrincipal,
} from './auth-provider.port';

const principal: VerifiedPrincipal = { subject: 'u-1', emailVerified: true };

class FakeProvider extends AuthProvider {
  override readonly providerId = 'test';
  override readonly capabilities = {
    emailPassword: true,
    emailVerification: true,
    passwordRecovery: true,
    mfa: true,
    accountLifecycleSignals: true,
  };

  constructor(private readonly failure?: AuthFailureCode) {
    super();
  }

  override verifyAccessToken(_token: string): Promise<VerifiedPrincipal> {
    if (this.failure) {
      return Promise.reject(new AuthFailureError(this.failure, `verify failed: ${this.failure}`));
    }
    return Promise.resolve(principal);
  }
}

describe('AuthProvider port contract', () => {
  it('returns the verified principal for a valid token', async () => {
    const provider = new FakeProvider();
    await expect(provider.verifyAccessToken('token')).resolves.toEqual(principal);
  });

  it('throws AuthFailureError with a stable code on failure (fail-closed)', async () => {
    const provider = new FakeProvider('TOKEN_EXPIRED');
    await expect(provider.verifyAccessToken('token')).rejects.toMatchObject({
      name: 'AuthFailureError',
      code: 'TOKEN_EXPIRED',
    });
  });

  it('exposes capability flags so flows can be gated per provider', () => {
    const provider = new FakeProvider();
    expect(provider.capabilities.emailPassword).toBe(true);
    expect(provider.providerId).toBe('test');
  });

  it.each<AuthFailureCode>([
    'TOKEN_MISSING',
    'TOKEN_INVALID',
    'TOKEN_EXPIRED',
    'TOKEN_REVOKED',
    'PROVIDER_UNAVAILABLE',
  ])('supports stable failure code %s', (code) => {
    const error = new AuthFailureError(code, 'x');
    expect(error.code).toBe(code);
  });
});
