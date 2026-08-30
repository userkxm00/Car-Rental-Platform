import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { AuthPrincipal } from '../src/auth/auth.guard';
import type { VerifiedPrincipal } from '../src/auth/ports/auth-provider.port';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';

/**
 * Test-only authenticated endpoint so the guard is actually exercised
 * (non-existent routes 404 in the router before guards run).
 */
@Controller('protected-demo')
class ProtectedDemoController {
  @Get()
  whoami(@AuthPrincipal() principal: VerifiedPrincipal): { authenticated: true; subject: string } {
    return { authenticated: true, subject: principal.subject };
  }
}

/**
 * Authentication boundary integration tests (01-B10).
 *
 * A local JWKS server publishes the test public key and signs access tokens,
 * so the real SupabaseAuthProvider verification path (RS256, issuer,
 * audience, expiry) is exercised with no external network access. The app
 * env is overridden per suite: JWKS URL + issuer point at the local server.
 */

const PORT = 4119;

describe('Authentication boundary (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;

  beforeAll(async () => {
    jwks = await startJwksTestServer(PORT);
    const testEnv = loadEnvSchema({
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:59999/unreachable',
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedDemoController],
    })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  it('rejects requests without a token with 401 UNAUTHORIZED', async () => {
    const res = await api(app).get('/api/v1/protected-demo').expect(401);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects tokens with an invalid signature with 401 TOKEN_INVALID', async () => {
    // Forged token: valid JWT shape, signed by a different (random) key.
    const forged = await jwks.signToken({ sub: 'forged-sub' });
    const tampered = `${forged.slice(0, forged.lastIndexOf('.'))}.AAAA`;
    const res = await api(app)
      .get('/api/v1/protected-demo')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects expired tokens with 401 TOKEN_EXPIRED', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await jwks.signToken({ sub: 'expired-sub', iat: now - 3600, exp: now - 60 });
    const res = await api(app)
      .get('/api/v1/protected-demo')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects tokens from a different issuer with 401 TOKEN_INVALID', async () => {
    const token = await jwks.signToken({
      sub: 'other-issuer-sub',
      iss: 'https://evil.example/auth/v1',
    });
    const res = await api(app)
      .get('/api/v1/protected-demo')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects tokens with a wrong audience with 401 TOKEN_INVALID', async () => {
    const token = await jwks.signToken({ sub: 'wrong-aud-sub', aud: 'some-other-audience' });
    const res = await api(app)
      .get('/api/v1/protected-demo')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('TOKEN_INVALID');
  });

  it('verifies a valid token and exposes the verified principal to the route', async () => {
    const token = await jwks.signToken({
      sub: 'integrated-user-1',
      email: 'a@b.co',
      email_verified: true,
    });
    // The route exists (test-only controller): a valid token must reach the
    // handler and receive the verified principal's subject.
    const res = await api(app)
      .get('/api/v1/protected-demo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ authenticated: true, subject: 'integrated-user-1' });
  });

  it('health endpoints stay public (no token required)', async () => {
    const res = await api(app).get('/api/v1/health/live').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('echoes the request ID on auth errors', async () => {
    const res = await api(app)
      .get('/api/v1/protected-demo')
      .set('X-Request-ID', 'auth-ctx-1')
      .expect(401);
    const body = res.body as ApiErrorBody;
    expect(body.error.requestId).toBe('auth-ctx-1');
  });
});
