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
 * Quote API integration tests (05-A): the calculated, expiring offer over
 * real HTTP + real PostgreSQL — vehicle and category targets, server-side
 * availability, the pricing boundary (null until PHASE-06), expiry, boundary
 * validation, authorization and tenant isolation.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4143;

const START_FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString();
const END_FUTURE = () => new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString();

interface QuoteBody {
  quoteId?: string;
  channel?: string;
  createdAt?: string;
  expiresAt?: string;
  expired?: boolean;
  request?: {
    start: string;
    end: string;
    mode: 'VEHICLE' | 'CATEGORY';
    vehicleId: string | null;
    categoryId: string | null;
  };
  availability?: {
    mode: string;
    available?: boolean;
    reasons?: Array<{ code: string; blockType?: string }>;
    eligible?: number;
    committed?: number;
    availableCount?: number;
  };
  pricing?: unknown;
}

describe('Quotes API (integration)', () => {
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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'qt-' } } });
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

  async function agencyToken(subject: string, tenantId: string): Promise<string> {
    const userId = await appUserId(subject);
    const existing = (await memberships.listForTenant(tenantId)).find((m) => m.userId === userId);
    if (!existing) {
      await memberships.invite(tenantId, userId, ['AGENCY_OWNER_ADMIN']);
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
    const slug = `qt-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Qt ${slug}`, slug });
    agencyId = tenant.id;
  }

  async function createCategory(code: string, tenantId = agencyId): Promise<string> {
    const category = await prisma.vehicleCategory.create({
      data: { tenantId, code, name: code },
    });
    return category.id;
  }

  async function createVehicle(categoryId: string, tenantId = agencyId): Promise<string> {
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId,
        categoryId,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `Q${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
      },
    });
    return vehicle.id;
  }

  beforeEach(async () => {
    await createTenant();
  });

  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { id: agencyId } });
  });

  function quoteBody(overrides: Record<string, string> = {}): Record<string, string> {
    return { start: START_FUTURE(), end: END_FUTURE(), ...overrides };
  }

  it('requires authentication and agency membership (POST + GET)', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send(quoteBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const quoteId = (created.body as QuoteBody).quoteId as string;

    await api(app).post(`/api/v1/agencies/${agencyId}/quotes`).send(quoteBody({ vehicleId })).expect(401);
    await api(app).get(`/api/v1/agencies/${agencyId}/quotes/${quoteId}`).expect(401);

    const stranger = await appUserId('qt-stranger');
    const forbidden = await api(app)
      .get(`/api/v1/agencies/${agencyId}/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${await token('qt-stranger')}`)
      .expect(403);
    expect((forbidden.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
    void stranger;
  });

  it('creates a vehicle quote with the computed availability and null pricing (05-A01/A03/A04)', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send(quoteBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const body = res.body as QuoteBody;
    expect(body.quoteId).toBeTruthy();
    expect(body.channel).toBe('AGENCY_WEB');
    expect(body.expired).toBe(false);
    expect(new Date(body.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
    expect(body.request).toMatchObject({ mode: 'VEHICLE', vehicleId });
    expect(body.availability).toMatchObject({ mode: 'VEHICLE', available: true, reasons: [] });
    expect(body.pricing).toBeNull();

    const read = await api(app)
      .get(`/api/v1/agencies/${agencyId}/quotes/${body.quoteId}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((read.body as QuoteBody).quoteId).toBe(body.quoteId);
    expect((read.body as QuoteBody).expired).toBe(false);
  });

  it('reports blocked vehicles unavailable with structured reasons (05-A03)', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    await prisma.vehicleBlock.create({
      data: {
        tenantId: agencyId,
        vehicleId,
        blockType: 'MAINTENANCE',
        startsAt: new Date(Date.now() + 23 * 3600_000),
        endsAt: new Date(Date.now() + 26 * 3600_000),
      },
    });

    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send(quoteBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const availability = (res.body as QuoteBody).availability as {
      mode: string;
      available: boolean;
      reasons: Array<{ code: string; blockType?: string }>;
    };
    expect(availability.available).toBe(false);
    expect(availability.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BLOCK_CONFLICT', blockType: 'MAINTENANCE' }),
      ]),
    );
  });

  it('creates a category quote from the capacity answer (05-A03)', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const categoryId = await createCategory('BASE');
    await createVehicle(categoryId);

    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send(quoteBody({ categoryId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const availability = (res.body as QuoteBody).availability as {
      mode: string;
      eligible: number;
      committed: number;
      availableCount: number;
    };
    expect(availability).toMatchObject({ mode: 'CATEGORY', eligible: 1, committed: 0, availableCount: 1 });
  });

  it('enforces the request boundary (05-A01/A02)', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const url = `/api/v1/agencies/${agencyId}/quotes`;
    const start = START_FUTURE();
    const end = END_FUTURE();

    for (const [body, code] of [
      [quoteBody(), 'QUOTE_TARGET_REQUIRED'],
      [quoteBody({ vehicleId, categoryId }), 'QUOTE_TARGET_EXCLUSIVE'],
      [quoteBody({ vehicleId, channel: 'NOPE' }), 'INVALID_CHANNEL'],
      [quoteBody({ vehicleId, end: start, start: end }), 'INVALID_INTERVAL'],
      [quoteBody({ vehicleId, start: '2026-09-10T08:00:00' }), 'INVALID_INTERVAL'],
      [
        quoteBody({ vehicleId, start: new Date(Date.now() - 3600_000).toISOString() }),
        'INTERVAL_IN_PAST',
      ],
    ] as Array<[Record<string, string>, string]>) {
      const res = await api(app)
        .post(url)
        .send(body)
        .set('Authorization', `Bearer ${auth}`)
        .expect(409);
      expect((res.body as ApiErrorBody).error.code).toBe(code);
    }
  });

  it('validates targets and locations against the tenant (05-A02)', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const url = `/api/v1/agencies/${agencyId}/quotes`;

    const unknownVehicle = await api(app)
      .post(url)
      .send(quoteBody({ vehicleId: '11111111-1111-4111-8111-111111111111' }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(404);
    expect((unknownVehicle.body as ApiErrorBody).error.code).toBe('VEHICLE_NOT_FOUND');

    const unknownBranch = await api(app)
      .post(url)
      .send(quoteBody({ vehicleId: '11111111-1111-4111-8111-111111111111', pickupBranchId: '22222222-2222-4222-8222-222222222222' }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(404);
    expect((unknownBranch.body as ApiErrorBody).error.code).toBe('BRANCH_NOT_FOUND');

    const otherTenant = await tenants.create({ name: 'Other', slug: `qt-other-${Date.now()}` });
    const otherCategory = await createCategory('OTHER', otherTenant.id);
    const otherRes = await api(app)
      .post(url)
      .send(quoteBody({ categoryId: otherCategory }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(404);
    expect((otherRes.body as ApiErrorBody).error.code).toBe('CATEGORY_NOT_FOUND');
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it('flags expired quotes explicitly and never hides the expiry (05-A05)', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send(quoteBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const quoteId = (created.body as QuoteBody).quoteId as string;

    await prisma.quoteRecord.update({
      where: { id: quoteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const read = await api(app)
      .get(`/api/v1/agencies/${agencyId}/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((read.body as QuoteBody).expired).toBe(true);
  });

  it('keeps quotes tenant-isolated', async () => {
    const auth = await agencyToken('qt-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send(quoteBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const quoteId = (created.body as QuoteBody).quoteId as string;

    const otherTenant = await tenants.create({ name: 'Other', slug: `qt-other-${Date.now()}` });
    const otherAuth = await agencyToken('qt-other-owner', otherTenant.id);
    const res = await api(app)
      .get(`/api/v1/agencies/${otherTenant.id}/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${otherAuth}`)
      .expect(404);
    expect((res.body as ApiErrorBody).error.code).toBe('QUOTE_NOT_FOUND');
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
