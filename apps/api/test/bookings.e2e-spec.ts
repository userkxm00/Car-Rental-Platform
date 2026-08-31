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
 * Booking aggregate integration tests (05-B03/B04/B05/B07/B08): real HTTP +
 * real PostgreSQL — vehicle/category bookings, per-tenant numbering,
 * server-side availability rejection, guard-protected holds, append-only
 * history, boundary validation, authorization and tenant isolation.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4144;

const START_FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString();
const END_FUTURE = () => new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString();

interface BookingBody {
  bookingId?: string;
  bookingNumber?: string;
  channel?: string;
  inventoryMode?: 'VEHICLE' | 'CATEGORY';
  status?: string;
  assignedVehicleId?: string | null;
  requestedCategoryId?: string | null;
  start?: string;
  end?: string;
  currency?: string;
  statusHistory?: Array<{
    historyId: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    actorUserId: string | null;
  }>;
}

describe('Bookings API (integration)', () => {
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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'bk-' } } });
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
    const slug = `bk-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Bk ${slug}`, slug });
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
        plateNumber: `B${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
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

  function bookingBody(overrides: Record<string, string> = {}): Record<string, string> {
    return { start: START_FUTURE(), end: END_FUTURE(), ...overrides };
  }

  it('requires authentication and agency membership on booking routes', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;

    await api(app).post(`/api/v1/agencies/${agencyId}/bookings`).send(bookingBody({ vehicleId })).expect(401);
    await api(app).get(`/api/v1/agencies/${agencyId}/bookings`).expect(401);
    await api(app).get(`/api/v1/agencies/${agencyId}/bookings/${bookingId}`).expect(401);

    const stranger = await appUserId('bk-stranger');
    const forbidden = await api(app)
      .get(`/api/v1/agencies/${agencyId}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${await token('bk-stranger')}`)
      .expect(403);
    expect((forbidden.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
    void stranger;
  });

  it('creates a vehicle booking as DRAFT with per-tenant numbering and history (05-B02/B03/B07)', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const first = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const second = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId, start: new Date(Date.now() + 72 * 3600_000).toISOString(), end: new Date(Date.now() + 75 * 3600_000).toISOString() }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const firstBody = first.body as BookingBody;
    const secondBody = second.body as BookingBody;
    expect(firstBody.bookingNumber).toBe('BK-2026-000001');
    expect(secondBody.bookingNumber).toBe('BK-2026-000002');
    expect(firstBody).toMatchObject({
      status: 'DRAFT',
      inventoryMode: 'VEHICLE',
      assignedVehicleId: vehicleId,
      currency: 'DZD',
    });
    expect(firstBody.statusHistory).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'DRAFT', reason: 'booking.created' }),
    ]);
  });

  it('rejects bookings for unavailable vehicles with BOOKING_UNAVAILABLE (05-B03)', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    await prisma.vehicleBlock.create({
      data: {
        tenantId: agencyId,
        vehicleId,
        blockType: 'DAMAGE',
        startsAt: new Date(Date.now() + 23 * 3600_000),
        endsAt: new Date(Date.now() + 26 * 3600_000),
      },
    });

    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((res.body as ApiErrorBody).error.code).toBe('BOOKING_UNAVAILABLE');
  });

  it('creates category bookings and rejects them when capacity is exhausted (05-B04)', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicle = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ categoryId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect(created.body as BookingBody).toMatchObject({
      inventoryMode: 'CATEGORY',
      assignedVehicleId: null,
      requestedCategoryId: categoryId,
    });

    // Block the only vehicle in the category for the interval: remaining
    // capacity drops to zero and the next category booking is rejected.
    await prisma.vehicleBlock.create({
      data: {
        tenantId: agencyId,
        vehicleId: vehicle,
        blockType: 'DAMAGE',
        startsAt: new Date(Date.now() + 23 * 3600_000),
        endsAt: new Date(Date.now() + 26 * 3600_000),
      },
    });

    const rejected = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ categoryId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((rejected.body as ApiErrorBody).error.code).toBe('BOOKING_UNAVAILABLE');
  });

  it('places a guard-protected hold and rejects overlapping intervals (05-B05)', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const first = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const firstId = (first.body as BookingBody).bookingId as string;

    // A second DRAFT booking for the same interval is allowed while nothing
    // is held (creation is an advisory availability check) — the hold is
    // what reserves inventory.
    const second = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const secondId = (second.body as BookingBody).bookingId as string;

    const held = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${firstId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const heldBody = held.body as BookingBody;
    expect(heldBody.status).toBe('HOLD');
    expect(heldBody.statusHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromStatus: 'DRAFT', toStatus: 'HOLD' }),
      ]),
    );

    const holdInDb = await prisma.bookingHold.findFirst({ where: { bookingId: firstId } });
    expect(holdInDb).toMatchObject({ status: 'ACTIVE', vehicleId, bookingId: firstId });

    // Re-holding the same booking is an invalid transition.
    const again = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${firstId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((again.body as ApiErrorBody).error.code).toBe('BOOKING_INVALID_TRANSITION');

    // The second booking's hold must fail on the commitment guard.
    const conflict = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${secondId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((conflict.body as ApiErrorBody).error.code).toBe('INTERVAL_CONFLICT');

    // With the interval held, new bookings for it are rejected up front.
    const third = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((third.body as ApiErrorBody).error.code).toBe('BOOKING_UNAVAILABLE');
  });

  it('enforces the request boundary (05-B03/B04)', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const url = `/api/v1/agencies/${agencyId}/bookings`;
    const start = START_FUTURE();
    const end = END_FUTURE();

    for (const [body, code] of [
      [bookingBody(), 'BOOKING_TARGET_REQUIRED'],
      [bookingBody({ vehicleId, categoryId }), 'BOOKING_TARGET_EXCLUSIVE'],
      [bookingBody({ vehicleId, channel: 'NOPE' }), 'INVALID_CHANNEL'],
      [bookingBody({ vehicleId, end: start, start: end }), 'INVALID_INTERVAL'],
      [
        bookingBody({ vehicleId, start: new Date(Date.now() - 3600_000).toISOString() }),
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

  it('validates targets and locations against the tenant (05-B03)', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const url = `/api/v1/agencies/${agencyId}/bookings`;

    const unknownVehicle = await api(app)
      .post(url)
      .send(bookingBody({ vehicleId: '11111111-1111-4111-8111-111111111111' }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(404);
    expect((unknownVehicle.body as ApiErrorBody).error.code).toBe('VEHICLE_NOT_FOUND');

    const otherTenant = await tenants.create({ name: 'Other', slug: `bk-other-${Date.now()}` });
    const otherCategory = await createCategory('OTHER', otherTenant.id);
    const otherRes = await api(app)
      .post(url)
      .send(bookingBody({ categoryId: otherCategory }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(404);
    expect((otherRes.body as ApiErrorBody).error.code).toBe('CATEGORY_NOT_FOUND');
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });

  it('keeps bookings and numbering tenant-isolated (05-B02/B07)', async () => {
    const auth = await agencyToken('bk-owner', agencyId);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(bookingBody({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;

    const otherTenant = await tenants.create({ name: 'Other', slug: `bk-other-${Date.now()}` });
    const otherAuth = await agencyToken('bk-other-owner', otherTenant.id);

    // Same quote of history invisible across agencies.
    const res = await api(app)
      .get(`/api/v1/agencies/${otherTenant.id}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${otherAuth}`)
      .expect(404);
    expect((res.body as ApiErrorBody).error.code).toBe('BOOKING_NOT_FOUND');

    // Numbering restarts per tenant.
    const otherCategory = await createCategory('OTHER', otherTenant.id);
    const otherVehicle = await createVehicle(otherCategory, otherTenant.id);
    const otherCreated = await api(app)
      .post(`/api/v1/agencies/${otherTenant.id}/bookings`)
      .send(bookingBody({ vehicleId: otherVehicle }))
      .set('Authorization', `Bearer ${otherAuth}`)
      .expect(201);
    expect((otherCreated.body as BookingBody).bookingNumber).toBe('BK-2026-000001');

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
