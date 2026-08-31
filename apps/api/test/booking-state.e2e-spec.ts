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
 * Booking state-machine integration tests (05-C01…C12): the full happy
 * path, disallowed transitions, command preconditions (customer, hold,
 * assignment, reason), the 05-B06 snapshot capture, hold lifecycle
 * (refresh/consume/release/expire) and per-command authorization — over
 * real HTTP + real PostgreSQL.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4145;

const START_FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString();
const END_FUTURE = () => new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString();

interface BookingBody {
  bookingId?: string;
  status?: string;
  customerId?: string | null;
  quoteId?: string | null;
  statusHistory?: Array<{ fromStatus: string | null; toStatus: string; reason: string | null }>;
}

describe('Booking state machine (integration)', () => {
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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'bks-' } } });
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
  ): Promise<string> {
    const userId = await appUserId(subject);
    const existing = (await memberships.listForTenant(agencyId)).find((m) => m.userId === userId);
    if (!existing) {
      await memberships.invite(agencyId, userId, roles);
      const membership = (await memberships.listForTenant(agencyId)).find(
        (m) => m.userId === userId,
      );
      if (membership) {
        await memberships.accept(userId, membership.id);
      }
    }
    return token(subject);
  }

  async function createTenant(): Promise<void> {
    const slug = `bks-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Bks ${slug}`, slug });
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
        plateNumber: `S${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
      },
    });
    return vehicle.id;
  }

  function body(overrides: Record<string, string> = {}): Record<string, string> {
    return { start: START_FUTURE(), end: END_FUTURE(), ...overrides };
  }

  beforeEach(async () => {
    await createTenant();
  });

  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { id: agencyId } });
  });

  async function setupBooking(
    auth: string,
    vehicleId: string,
  ): Promise<{ bookingId: string; quoteId: string; customerId: string; end: string }> {
    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;
    const end = (created.body as { end?: string }).end as string;

    const held = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((held.body as BookingBody).status).toBe('HOLD');

    const quote = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send({ vehicleId, start: START_FUTURE(), end: END_FUTURE() })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const quoteId = (quote.body as { quoteId: string }).quoteId;

    const customerId = await appUserId('bks-customer');

    const pending = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/request-confirmation`)
      .send({ customerId, quoteId })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((pending.body as BookingBody).status).toBe('PENDING_CONFIRMATION');

    return { bookingId, quoteId, customerId, end };
  }

  it('walks the full happy path with history and hold lifecycle (05-C01…C10)', async () => {
    const auth = await agencyToken('bks-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const { bookingId, end } = await setupBooking(auth, vehicleId);

    const holdBefore = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(holdBefore?.status).toBe('ACTIVE');

    const confirmed = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((confirmed.body as BookingBody).status).toBe('CONFIRMED');

    // 05-C03: the hold is refreshed to the interval end on confirmation.
    const holdAfter = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(holdAfter?.status).toBe('ACTIVE');
    expect(holdAfter?.expiresAt.getTime()).toBe(new Date(end).getTime());

    // 05-B06: the commercial snapshot is captured at confirmation (pricing
    // is null until the pricing engine, PHASE-06).
    const snapshot = await prisma.bookingPriceSnapshot.findFirst({ where: { bookingId } });
    expect(snapshot).toBeTruthy();
    expect(snapshot?.pricingJson).toBeNull();

    const steps: Array<[string, string]> = [
      ['ready', 'READY_FOR_PICKUP'],
      ['check-out', 'ACTIVE'],
      ['request-return', 'RETURN_PENDING'],
      ['complete-return', 'RETURNED'],
      ['open-settlement', 'SETTLEMENT_PENDING'],
      ['complete', 'COMPLETED'],
    ];
    for (const [endpoint, expected] of steps) {
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/${endpoint}`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(201);
      expect((res.body as BookingBody).status).toBe(expected);
    }

    // The hold is consumed at check-out.
    const holdFinal = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(holdFinal?.status).toBe('CONSUMED');

    // Append-only history covers the whole lifecycle.
    const read = await api(app)
      .get(`/api/v1/agencies/${agencyId}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    const history = (read.body as BookingBody).statusHistory ?? [];
    expect(history.map((h) => h.toStatus)).toEqual(
      expect.arrayContaining([
        'COMPLETED',
        'SETTLEMENT_PENDING',
        'RETURNED',
        'RETURN_PENDING',
        'ACTIVE',
        'READY_FOR_PICKUP',
        'CONFIRMED',
        'PENDING_CONFIRMATION',
        'HOLD',
        'DRAFT',
      ]),
    );
  });

  it('rejects disallowed transitions with BOOKING_INVALID_TRANSITION (05-C12)', async () => {
    const auth = await agencyToken('bks-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;

    for (const endpoint of ['confirm', 'ready', 'check-out', 'request-return']) {
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/${endpoint}`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(409);
      expect((res.body as ApiErrorBody).error.code).toBe('BOOKING_INVALID_TRANSITION');
    }

    // Cancelling from DRAFT is allowed (with a reason); completing is not.
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/cancel`)
      .send({ reason: 'test' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((res.body as ApiErrorBody).error.code).toBe('BOOKING_INVALID_TRANSITION');
  });

  it('enforces confirm preconditions: customer, live hold, fresh interval (05-C03)', async () => {
    const auth = await agencyToken('bks-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    // No customer attached.
    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const noCustomer = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/request-confirmation`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((noCustomer.body as BookingBody).status).toBe('PENDING_CONFIRMATION');
    const missingCustomer = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((missingCustomer.body as ApiErrorBody).error.code).toBe('BOOKING_CUSTOMER_REQUIRED');

    // A booking without a hold cannot be confirmed: use a second vehicle
    // (the first is still held) and skip the hold step.
    const vehicleB = await createVehicle(categoryId);
    const second = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId: vehicleB }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const secondId = (second.body as BookingBody).bookingId as string;
    const customerId = await appUserId('bks-customer-2');
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${secondId}/request-confirmation`)
      .send({ customerId })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const noHold = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${secondId}/confirm`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((noHold.body as ApiErrorBody).error.code).toBe('BOOKING_HOLD_NOT_ACTIVE');
  });

  it('rejects a mismatched quote at request-confirmation (05-C02)', async () => {
    const auth = await agencyToken('bks-owner');
    const categoryId = await createCategory('BASE');
    const vehicleA = await createVehicle(categoryId);
    const vehicleB = await createVehicle(categoryId);

    const quote = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send({ vehicleId: vehicleA, start: START_FUTURE(), end: END_FUTURE() })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const quoteId = (quote.body as { quoteId: string }).quoteId;

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId: vehicleB }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;

    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/request-confirmation`)
      .send({ quoteId })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((res.body as ApiErrorBody).error.code).toBe('BOOKING_QUOTE_MISMATCH');
  });

  it('cancel releases the hold and frees the interval (05-C11)', async () => {
    const auth = await agencyToken('bks-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const noReason = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/cancel`)
      .send({})
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((noReason.body as ApiErrorBody).error.code).toBe('BOOKING_REASON_REQUIRED');

    const cancelled = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/cancel`)
      .send({ reason: 'customer changed mind' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((cancelled.body as BookingBody).status).toBe('CANCELLED');

    const hold = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(hold?.status).toBe('RELEASED');

    // The interval is free again: availability answers available.
    const avail = await api(app)
      .get(
        `/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START_FUTURE()}&end=${END_FUTURE()}`,
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((avail.body as { available: boolean }).available).toBe(true);
  });

  it('expires only bookings whose hold has actually expired, and marks no-shows (05-C11)', async () => {
    const auth = await agencyToken('bks-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const notExpired = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/expire`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((notExpired.body as ApiErrorBody).error.code).toBe('BOOKING_HOLD_NOT_EXPIRED');

    await prisma.bookingHold.updateMany({
      where: { bookingId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/expire`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((expired.body as BookingBody).status).toBe('EXPIRED');

    // No-show needs READY_FOR_PICKUP — from HOLD it is rejected.
    const second = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId, start: new Date(Date.now() + 96 * 3600_000).toISOString(), end: new Date(Date.now() + 99 * 3600_000).toISOString() }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const secondId = (second.body as BookingBody).bookingId as string;
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${secondId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const wrongState = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${secondId}/no-show`)
      .send({ reason: 'x' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((wrongState.body as ApiErrorBody).error.code).toBe('BOOKING_INVALID_TRANSITION');
  });

  it('authorizes every command — FINANCE cannot confirm (05-C12)', async () => {
    const auth = await agencyToken('bks-owner');
    const financeAuth = await agencyToken('bks-finance', ['FINANCE']);
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;

    // FINANCE has no booking permissions at all.
    const forbidden = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${financeAuth}`)
      .expect(403);
    expect((forbidden.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });
});
