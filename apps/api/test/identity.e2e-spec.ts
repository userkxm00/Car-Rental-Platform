import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * User identity integration tests (01-C08).
 *
 * Exercises the full identity path — token verification → provider-subject
 * resolution → PostgreSQL provisioning/profile use-cases — against the real
 * local test database (TESTING.md). Rows created here are deleted at the end.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4127;

interface ProfileBody {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  preferredLocale: string;
  timezone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  changed?: string[];
}

function asProfile(body: unknown): ProfileBody {
  return body as ProfileBody;
}

describe('User identity (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const testEnv = loadEnvSchema({
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    // Self-healing cleanup: this suite owns the `itest-` namespace in the
    // test database. Users are removed by their provider link (cascade) or
    // by their suite-owned email; null-email suite users are also removed so
    // interrupted runs never poison the next one.
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: 'itest-' } },
          { identities: { some: { providerSubject: { startsWith: 'itest-' } } } },
          { identities: { none: {} }, email: null },
        ],
      },
    });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function authToken(subject: string, claims: Record<string, unknown> = {}): Promise<string> {
    return jwks.signToken({ sub: subject, ...claims });
  }

  async function getMe(token: string): Promise<{ status: number; body: unknown }> {
    const res = await api(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    return { status: res.status, body: res.body as unknown };
  }

  it('provisions an unknown verified principal and returns its profile via GET /me', async () => {
    const token = await authToken('itest-sub-1', {
      email: 'itest-a@kavriqo.test',
      email_verified: true,
    });
    const res = await getMe(token);
    expect(res.status).toBe(200);
    const profile = asProfile(res.body);
    expect(profile).toMatchObject({
      email: 'itest-a@kavriqo.test',
      displayName: 'itest-a',
      preferredLocale: 'en',
      status: 'ACTIVE',
    });
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile.phone).toBeNull();
  });

  it('provisioning is idempotent: repeated logins map to the same application user', async () => {
    const token = await authToken('itest-sub-1', {
      email: 'itest-a@kavriqo.test',
      email_verified: true,
    });
    const first = asProfile((await getMe(token)).body);
    const second = asProfile((await getMe(token)).body);
    expect(second.id).toBe(first.id);
  });

  it('never provisions email from unverified claims (01-B04 invariant)', async () => {
    const token = await authToken('itest-sub-2', {
      email: 'unverified@kavriqo.test',
      email_verified: false,
    });
    const profile = asProfile((await getMe(token)).body);
    expect(profile.email).toBeNull();
    expect(profile.displayName).toBe('User');
  });

  it('provider-subject consistency: subject always resolves to its original user (01-C07)', async () => {
    const token = await authToken('itest-sub-3', {
      email: 'itest-b@kavriqo.test',
      email_verified: true,
    });
    const first = asProfile((await getMe(token)).body);
    const token2 = await authToken('itest-sub-3', {
      email: 'itest-b@kavriqo.test',
      email_verified: true,
      aal: 'aal2',
    });
    const second = asProfile((await getMe(token2)).body);
    expect(second.id).toBe(first.id);
  });

  it('rejects a second identity claiming an email owned by another user (01-C05)', async () => {
    const token = await authToken('itest-sub-4', {
      email: 'itest-a@kavriqo.test',
      email_verified: true,
    });
    const res = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('EMAIL_TAKEN');
  });

  it('updates the profile via PATCH /me and validates inputs', async () => {
    const token = await authToken('itest-sub-5', {
      email: 'itest-c@kavriqo.test',
      email_verified: true,
    });
    const res = await api(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: '  Karim  ', preferredLocale: 'ar', timezone: 'Africa/Algiers' })
      .expect(200);
    const profile = asProfile(res.body);
    expect(profile.displayName).toBe('Karim');
    expect(profile.preferredLocale).toBe('ar');
    expect(profile.timezone).toBe('Africa/Algiers');
    expect(profile.changed).toEqual(['displayName', 'preferredLocale', 'timezone']);

    const invalid = await api(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLocale: 'de', bogus: 1 })
      .expect(400);
    const body = invalid.body as ApiErrorBody;
    expect(body.error.code).toBe('PROFILE_VALIDATION_FAILED');
    expect(JSON.stringify(body.error.details)).toContain('preferredLocale');
    expect(JSON.stringify(body.error.details)).toContain('bogus');
  });

  it('rejects profile access without a token (guard applies)', async () => {
    const res = await api(app).get('/api/v1/me').expect(401);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('blocks a SUSPENDED application identity with 403 USER_DISABLED', async () => {
    const token = await authToken('itest-sub-6', {
      email: 'itest-d@kavriqo.test',
      email_verified: true,
    });
    await getMe(token);

    const identity = await prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'supabase', providerSubject: 'itest-sub-6' } },
    });
    expect(identity).not.toBeNull();
    const userId = identity?.userId;
    if (!userId) {
      throw new Error('expected identity');
    }
    await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

    const res = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('USER_DISABLED');

    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  });

  it('persists locale/timezone preferences across sessions (01-C04)', async () => {
    const token = await authToken('itest-sub-7', {
      email: 'itest-e@kavriqo.test',
      email_verified: true,
    });
    await api(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLocale: 'fr', timezone: 'Africa/Algiers' })
      .expect(200);

    const again = asProfile((await getMe(token)).body);
    expect(again.preferredLocale).toBe('fr');
    expect(again.timezone).toBe('Africa/Algiers');
  });
});
