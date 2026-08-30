import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { InMemorySessionRevocationBoundary } from '../src/auth/infrastructure/in-memory-session-revocation';
import { SessionRevocationBoundary } from '../src/auth/ports/session-revocation.port';
import { RateLimit, RateLimitGuard } from '../src/security/rate-limit/rate-limit.guard';
import { SecurityModule } from '../src/security/security.module';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * Security regression suite (01-E04): revocation and rate-limit boundaries
 * exercised end-to-end over real HTTP.
 */

@Controller('security-demo')
class SecurityDemoController {
  @Get('slow')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 3 })
  slow(): { ok: true } {
    return { ok: true };
  }
}

const JWKS_PORT = 4129;

describe('Security boundaries (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let revocation: InMemorySessionRevocationBoundary;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const testEnv = loadEnvSchema({
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental',
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    revocation = new InMemorySessionRevocationBoundary();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SecurityModule],
      controllers: [SecurityDemoController],
    })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .overrideProvider(SessionRevocationBoundary)
      .useValue(revocation)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  describe('session revocation (01-E01)', () => {
    it('accepts a verified session before revocation', async () => {
      const token = await jwks.signToken({
        sub: 'sec-revoke-1',
        session_id: 'sec-session-1',
        email: 'sec-revoke-1@kavriqo.test',
        email_verified: true,
      });
      const res = await api(app)
        .get('/api/v1/security-demo/slow')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('rejects the same verified token with 401 TOKEN_REVOKED after revocation', async () => {
      await revocation.revoke({ subject: 'sec-revoke-1', sessionId: 'sec-session-1' });
      const token = await jwks.signToken({
        sub: 'sec-revoke-1',
        session_id: 'sec-session-1',
        email: 'sec-revoke-1@kavriqo.test',
        email_verified: true,
      });
      const res = await api(app)
        .get('/api/v1/security-demo/slow')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      const body = res.body as ApiErrorBody;
      expect(body.error.code).toBe('TOKEN_REVOKED');
      expect(body.error.message).toBe('This session has been revoked.');
    });

    it('subject-wide revocation blocks every session of the subject', async () => {
      await revocation.revoke({ subject: 'sec-revoke-2' });
      const token = await jwks.signToken({
        sub: 'sec-revoke-2',
        session_id: 'another-session',
        email: 'sec-revoke-2@kavriqo.test',
        email_verified: true,
      });
      const res = await api(app)
        .get('/api/v1/security-demo/slow')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect((res.body as ApiErrorBody).error.code).toBe('TOKEN_REVOKED');
    });
  });

  describe('rate limiting (01-E02)', () => {
    it('allows requests within the window limit', async () => {
      const token = await jwks.signToken({
        sub: 'sec-rate-1',
        email: 'sec-rate-1@kavriqo.test',
        email_verified: true,
      });
      for (let i = 0; i < 3; i += 1) {
        await api(app)
          .get('/api/v1/security-demo/slow')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });

    it('returns the documented 429 RATE_LIMITED envelope beyond the limit', async () => {
      const token = await jwks.signToken({
        sub: 'sec-rate-1',
        email: 'sec-rate-1@kavriqo.test',
        email_verified: true,
      });
      const res = await api(app)
        .get('/api/v1/security-demo/slow')
        .set('Authorization', `Bearer ${token}`)
        .expect(429);
      const body = res.body as ApiErrorBody;
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(typeof (body.error.details as { retryAfterSeconds: number }).retryAfterSeconds).toBe(
        'number',
      );
    });

    it('never leaks internals in security error responses (01-E03)', async () => {
      const res = await api(app).get('/api/v1/security-demo/slow').expect(401);
      const body = res.body as ApiErrorBody;
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(JSON.stringify(body)).not.toMatch(/secret|token|stack|jwt/i);
    });
  });
});
