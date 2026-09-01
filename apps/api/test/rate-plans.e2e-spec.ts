import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { MembershipService } from '../src/memberships/application/membership.service';
import { TenantService } from '../src/tenants/application/tenant.service';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-06 / 06-A07 rate administration integration tests: CRUD over real
 * HTTP + PostgreSQL with tenant scope, role-based permissions (FINANCE
 * reads, never manages), the uniqueness constraint, boundary validation
 * and scope-target tenant validation (06-A04).
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4147;

interface RatePlanBody {
  ratePlanId?: string;
  code?: string;
  currency?: string;
  durationUnit?: string;
  baseRateMinor?: number;
  precedence?: number;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  active?: boolean;
  scopes?: Array<{ vehicleId: string | null; categoryId: string | null }>;
}

describe('Rate plan administration (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let agencyId: string;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const env = loadEnvSchema({
      NODE_ENV: 'test',
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      TEST_DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(env)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    tenants = app.get(TenantService);
    memberships = app.get(MembershipService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'bkp-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function token(subject: string): Promise<string> {
    return jwks.signToken({ sub: subject, email: `${subject}@kavriqo.test`, email_verified: true });
  }

  async function appUserId(subject: string): Promise<string> {
    const res = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${await token(subject)}`)
      .expect(200);
    return (res.body as { id: string }).id;
  }

  async function agencyToken(
    subject: string,
    roles: Array<'AGENCY_OWNER_ADMIN' | 'FINANCE'> = ['AGENCY_OWNER_ADMIN'],
    tenantId: string = agencyId,
  ): Promise<string> {
    const userId = await appUserId(subject);
    const existing = (await memberships.listForTenant(tenantId)).find((m) => m.userId === userId);
    if (!existing) {
      await memberships.invite(tenantId, userId, roles);
      const membership = (await memberships.listForTenant(tenantId)).find(
        (m) => m.userId === userId,
      );
      if (membership) {
        await memberships.accept(userId, membership.id);
      }
    }
    return token(subject);
  }

  async function createTenant(): Promise<void> {
    const slug = `bkp-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Bkp ${slug}`, slug });
    agencyId = tenant.id;
  }

  async function createCategory(code: string): Promise<string> {
    const category = await prisma.vehicleCategory.create({
      data: { tenantId: agencyId, code, name: code },
    });
    return category.id;
  }

  async function createVehicle(categoryId: string): Promise<string> {
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `P${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
      },
    });
    return vehicle.id;
  }

  const planBody = (overrides: Record<string, unknown> = {}) => ({
    code: 'BASE',
    name: 'Base rate',
    currency: 'DZD',
    durationUnit: 'DAILY',
    baseRateMinor: 5000,
    precedence: 0,
    effectiveFrom: '2026-08-01T00:00:00Z',
    ...overrides,
  });

  beforeEach(async () => {
    await createTenant();
  });

  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { id: agencyId } });
  });

  it('creates, reads and lists tenant-scoped rate plans (06-A07)', async () => {
    const auth = await agencyToken('bkp-owner');
    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(planBody())
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const ratePlanId = (created.body as RatePlanBody).ratePlanId as string;
    expect(created.body).toMatchObject({
      code: 'BASE',
      currency: 'DZD',
      durationUnit: 'DAILY',
      baseRateMinor: 5000,
      precedence: 0,
      active: true,
      scopes: [],
    });

    const read = await api(app)
      .get(`/api/v1/agencies/${agencyId}/pricing/rate-plans/${ratePlanId}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((read.body as RatePlanBody).ratePlanId).toBe(ratePlanId);

    const list = await api(app)
      .get(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('enforces the unique code per agency and the boundary matrix (06-A01/A02/A05)', async () => {
    const auth = await agencyToken('bkp-owner');
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(planBody())
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const duplicate = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(planBody({ name: 'Another' }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((duplicate.body as ApiErrorBody).error.code).toBe('RATE_PLAN_CODE_TAKEN');

    const cases: Array<[Record<string, unknown>, string]> = [
      [planBody({ code: 'BASE', currency: 'BTC' }), 'RATE_PLAN_CURRENCY_UNSUPPORTED'],
      [planBody({ code: 'BASE', durationUnit: 'FORTNIGHT' }), 'RATE_PLAN_UNIT_INVALID'],
      [planBody({ code: 'BASE', baseRateMinor: 12.5 }), 'RATE_PLAN_RATE_INVALID'],
      [
        planBody({ code: 'BASE', effectiveUntil: '2026-07-01T00:00:00Z' }),
        'RATE_PLAN_WINDOW_INVALID',
      ],
    ];
    for (const [body, code] of cases) {
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
        .send({ ...body, code: `C${Math.random().toString(36).slice(2, 8).toUpperCase()}` })
        .set('Authorization', `Bearer ${auth}`)
        .expect(409);
      expect((res.body as ApiErrorBody).error.code).toBe(code);
    }
  });

  it('validates scope targets against tenant-owned vehicles/categories (06-A04)', async () => {
    const auth = await agencyToken('bkp-owner');
    const categoryId = await createCategory('ECON');
    const vehicleId = await createVehicle(categoryId);

    const scoped = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(planBody({ scopes: [{ vehicleId }, { categoryId }] }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((scoped.body as RatePlanBody).scopes).toEqual([
      { vehicleId, categoryId: null },
      { vehicleId: null, categoryId },
    ]);

    const foreign = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(
        planBody({
          code: 'SCOPED2',
          scopes: [{ vehicleId: '00000000-0000-4000-8000-000000000000' }],
        }),
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((foreign.body as ApiErrorBody).error.code).toBe('VEHICLE_NOT_FOUND');
  });

  it('patches with merge semantics, deactivation and scope replacement (06-A03/A07)', async () => {
    const auth = await agencyToken('bkp-owner');
    const categoryId = await createCategory('ECON');
    const vehicleA = await createVehicle(categoryId);
    const vehicleB = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(
        planBody({
          effectiveUntil: '2026-12-31T23:59:59Z',
          scopes: [{ vehicleId: vehicleA }],
        }),
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const ratePlanId = (created.body as RatePlanBody).ratePlanId as string;

    const updated = await api(app)
      .patch(`/api/v1/agencies/${agencyId}/pricing/rate-plans/${ratePlanId}`)
      .send({
        baseRateMinor: 6000,
        effectiveUntil: null,
        scopes: [{ vehicleId: vehicleB }],
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect(updated.body).toMatchObject({
      ratePlanId,
      baseRateMinor: 6000,
      effectiveUntil: null,
      active: true,
      scopes: [{ vehicleId: vehicleB, categoryId: null }],
    });

    const deactivated = await api(app)
      .patch(`/api/v1/agencies/${agencyId}/pricing/rate-plans/${ratePlanId}`)
      .send({ active: false })
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((deactivated.body as RatePlanBody).active).toBe(false);
    expect((deactivated.body as RatePlanBody).baseRateMinor).toBe(6000);
  });

  it('isolates tenants and enforces pricing permissions (FINANCE reads only)', async () => {
    const ownerAuth = await agencyToken('bkp-owner');
    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(planBody())
      .set('Authorization', `Bearer ${ownerAuth}`)
      .expect(201);
    const ratePlanId = (created.body as RatePlanBody).ratePlanId as string;

    // A second agency cannot see or patch the first agency's plan.
    const otherSlug = `bkp-other-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const other = await tenants.create({ name: `Bkp other ${otherSlug}`, slug: otherSlug });
    try {
      const otherAuth = await agencyToken('bkp-other-owner', ['AGENCY_OWNER_ADMIN'], other.id);
      const foreignRead = await api(app)
        .get(`/api/v1/agencies/${other.id}/pricing/rate-plans/${ratePlanId}`)
        .set('Authorization', `Bearer ${otherAuth}`)
        .expect(404);
      expect((foreignRead.body as ApiErrorBody).error.code).toBe('RATE_PLAN_NOT_FOUND');
    } finally {
      await prisma.tenant.deleteMany({ where: { id: other.id } });
    }

    // FINANCE can read the plans but never manage them.
    const financeAuth = await agencyToken('bkp-finance', ['FINANCE']);
    await api(app)
      .get(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .set('Authorization', `Bearer ${financeAuth}`)
      .expect(200);
    const forbidden = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/rate-plans`)
      .send(planBody({ code: 'FINANCE' }))
      .set('Authorization', `Bearer ${financeAuth}`)
      .expect(403);
    expect((forbidden.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });
});
