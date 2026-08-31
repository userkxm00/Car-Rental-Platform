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
 * Booking lifecycle integration tests (05-D01…D10): cancellation records
 * (customer/agency), hold-expiration sweep, no-show, extension requests
 * with availability conflicts and decisions, vehicle reassignment,
 * walk-in bookings and idempotent commands — over real HTTP + PostgreSQL.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4146;

const START_FUTURE = () => new Date(Date.now() + 24 * 3600_000).toISOString();
const END_FUTURE = () => new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString();

interface BookingBody {
  bookingId?: string;
  status?: string;
  channel?: string;
  customerId?: string | null;
  assignedVehicleId?: string | null;
  start?: string;
  end?: string;
  statusHistory?: Array<{ fromStatus: string | null; toStatus: string; reason: string | null }>;
}

describe('Booking lifecycle operations (integration)', () => {
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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'bkl-' } } });
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
    const slug = `bkl-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Bkl ${slug}`, slug });
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
        plateNumber: `L${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
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

  /** create → hold → request-confirmation (customer + quote attached). */
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
    const end = (created.body as BookingBody).end as string;

    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const quote = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send({ vehicleId, start: START_FUTURE(), end: END_FUTURE() })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const quoteId = (quote.body as { quoteId: string }).quoteId;

    const customerId = await appUserId('bkl-customer');

    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/request-confirmation`)
      .send({ customerId, quoteId })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    return { bookingId, quoteId, customerId, end };
  }

  async function walkTo(
    auth: string,
    bookingId: string,
    endpoint: string,
    expected: string,
  ): Promise<void> {
    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/${endpoint}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((res.body as BookingBody).status).toBe(expected);
  }

  it('cancellation records initiator, reason and policy (05-D01/D02)', async () => {
    const auth = await agencyToken('bkl-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const { bookingId } = await setupBooking(auth, vehicleId);

    const cancelled = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/cancel`)
      .send({ reason: 'plans changed', initiator: 'CUSTOMER' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((cancelled.body as BookingBody).status).toBe('CANCELLED');

    // The hold is released and the policy row records the decision.
    const hold = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(hold?.status).toBe('RELEASED');
    const record = await prisma.bookingCancellation.findFirst({ where: { bookingId } });
    expect(record?.initiator).toBe('CUSTOMER');
    expect(record?.reason).toBe('plans changed');

    // The append-only history carries the cancellation.
    const read = await api(app)
      .get(`/api/v1/agencies/${agencyId}/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    const history = (read.body as BookingBody).statusHistory ?? [];
    expect(history.map((h) => h.toStatus)).toContain('CANCELLED');
  });

  it('expires held bookings past the hold TTL (05-D03)', async () => {
    const auth = await agencyToken('bkl-owner');
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

    // Simulate the TTL lapsing.
    await prisma.bookingHold.updateMany({
      where: { bookingId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const swept = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/expire-stale-holds`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((swept.body as { expired: number }).expired).toBe(1);

    const hold = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(hold?.status).toBe('EXPIRED');
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { statusHistory: true },
    });
    expect(booking.status).toBe('EXPIRED');
    expect(booking.statusHistory.map((h) => h.reason)).toContain('booking.hold_expired');
  });

  it('no-show requires the pickup instant to have passed (05-D04)', async () => {
    const auth = await agencyToken('bkl-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const { bookingId } = await setupBooking(auth, vehicleId);
    await walkTo(auth, bookingId, 'confirm', 'CONFIRMED');
    await walkTo(auth, bookingId, 'ready', 'READY_FOR_PICKUP');

    // Pickup is in the future — no-show is refused.
    const early = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/no-show`)
      .send({ reason: 'did not arrive' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((early.body as ApiErrorBody).error.code).toBe('BOOKING_INVALID_TRANSITION');

    // Once the pickup instant has passed, the documented policy applies.
    await prisma.booking.updateMany({
      where: { id: bookingId },
      data: { startsAt: new Date(Date.now() - 3600_000) },
    });
    const late = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/no-show`)
      .send({ reason: 'did not arrive' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((late.body as BookingBody).status).toBe('NO_SHOW');

    const hold = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(hold?.status).toBe('RELEASED');
  });

  it('requests, approves, rejects extensions with conflict handling (05-D05/D06)', async () => {
    const auth = await agencyToken('bkl-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const { bookingId, end } = await setupBooking(auth, vehicleId);
    await walkTo(auth, bookingId, 'confirm', 'CONFIRMED');
    await walkTo(auth, bookingId, 'ready', 'READY_FOR_PICKUP');
    await walkTo(auth, bookingId, 'check-out', 'ACTIVE');

    // A competing hold on the same vehicle overlaps the extension interval.
    const conflicting = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send({
        vehicleId,
        start: new Date(new Date(end).getTime() + 1800_000).toISOString(),
        end: new Date(new Date(end).getTime() + 5400_000).toISOString(),
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const conflictingId = (conflicting.body as BookingBody).bookingId as string;
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${conflictingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const extensionEnd = new Date(new Date(end).getTime() + 2 * 3600_000).toISOString();
    const refused = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/extensions`)
      .send({ end: extensionEnd, reason: 'keep the car' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((refused.body as ApiErrorBody).error.code).toBe('INTERVAL_CONFLICT');
    // Nothing was persisted for the refused request.
    expect(await prisma.bookingExtension.count({ where: { bookingId } })).toBe(0);

    // Release the competing hold and request again.
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${conflictingId}/cancel`)
      .send({ reason: 'no longer needed' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const requested = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/extensions`)
      .send({ end: extensionEnd, reason: 'keep the car' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const extensionId = (requested.body as { extensionId: string }).extensionId;
    expect((requested.body as { status: string }).status).toBe('REQUESTED');

    // Approve: booking interval is extended, decision audited.
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/extensions/${extensionId}/approve`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const extended = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { statusHistory: true },
    });
    expect(extended.endsAt.toISOString()).toBe(extensionEnd);
    expect(extended.statusHistory.map((h) => h.reason)).toContain(
      `booking.extended:${extensionId}`,
    );
    const approved = await prisma.bookingExtension.findUniqueOrThrow({ where: { id: extensionId } });
    expect(approved.status).toBe('APPROVED');

    // A second request can be rejected with an audited reason.
    const secondEnd = new Date(new Date(extensionEnd).getTime() + 2 * 3600_000).toISOString();
    const second = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/extensions`)
      .send({ end: secondEnd, reason: 'one more day' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const secondId = (second.body as { extensionId: string }).extensionId;
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/extensions/${secondId}/reject`)
      .send({ reason: 'fleet needs the vehicle' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const rejected = await prisma.bookingExtension.findUniqueOrThrow({ where: { id: secondId } });
    expect(rejected.status).toBe('REJECTED');
  });

  it('reassigns the vehicle before the rental with assignment history (05-D07)', async () => {
    const auth = await agencyToken('bkl-owner');
    const categoryId = await createCategory('BASE');
    const vehicleA = await createVehicle(categoryId);
    const vehicleB = await createVehicle(categoryId);
    const vehicleC = await createVehicle(categoryId);
    const { bookingId } = await setupBooking(auth, vehicleA);

    // Vehicle B is held by another booking over the same interval.
    const other = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send(body({ vehicleId: vehicleB }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const otherId = (other.body as BookingBody).bookingId as string;
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${otherId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const refused = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/reassign`)
      .send({ vehicleId: vehicleB, reason: 'swap' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((refused.body as ApiErrorBody).error.code).toBe('INTERVAL_CONFLICT');

    // Vehicle C is free — the hold moves with the booking.
    const moved = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/reassign`)
      .send({ vehicleId: vehicleC, reason: 'swap' })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((moved.body as BookingBody).assignedVehicleId).toBe(vehicleC);

    const hold = await prisma.bookingHold.findFirst({ where: { bookingId, status: 'ACTIVE' } });
    expect(hold?.vehicleId).toBe(vehicleC);
    const assignment = await prisma.bookingAssignment.findFirst({ where: { bookingId } });
    expect(assignment?.fromVehicleId).toBe(vehicleA);
    expect(assignment?.toVehicleId).toBe(vehicleC);
    expect(assignment?.reason).toBe('swap');
  });

  it('walk-in bookings chain the domain commands to ACTIVE (05-D08)', async () => {
    const auth = await agencyToken('bkl-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/walk-in`)
      .send({ vehicleId, end: new Date(Date.now() + 2 * 3600_000).toISOString() })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;

    expect((created.body as BookingBody).status).toBe('ACTIVE');
    expect((created.body as BookingBody).channel).toBe('WALK_IN');
    expect((created.body as BookingBody).customerId).toBeNull();

    const hold = await prisma.bookingHold.findFirst({ where: { bookingId } });
    expect(hold?.status).toBe('CONSUMED');
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { statusHistory: true },
    });
    expect(booking.statusHistory.map((h) => h.toStatus)).toEqual(
      expect.arrayContaining(['DRAFT', 'HOLD', 'PENDING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_PICKUP', 'ACTIVE']),
    );
  });

  it('replays idempotent commands with the original result (05-D09)', async () => {
    const auth = await agencyToken('bkl-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    // The same key returns the same booking; nothing is written twice.
    const first = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .set('Authorization', `Bearer ${auth}`)
      .set('Idempotency-Key', 'create-1')
      .send(body({ vehicleId }))
      .expect(201);
    const second = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .set('Authorization', `Bearer ${auth}`)
      .set('Idempotency-Key', 'create-1')
      .send(body({ vehicleId }))
      .expect(201);
    const bookingId = (first.body as BookingBody).bookingId as string;
    expect((second.body as BookingBody).bookingId).toBe(bookingId);
    expect(await prisma.booking.count({ where: { id: bookingId } })).toBe(1);

    // A different key is a different command.
    const third = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .set('Authorization', `Bearer ${auth}`)
      .set('Idempotency-Key', 'create-2')
      .send(body({ vehicleId }))
      .expect(201);
    expect((third.body as BookingBody).bookingId).not.toBe(bookingId);

    // Hold replay: one ACTIVE hold, same booking.
    const held = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .set('Idempotency-Key', 'hold-1')
      .expect(201);
    expect((held.body as BookingBody).status).toBe('HOLD');
    const heldAgain = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .set('Idempotency-Key', 'hold-1')
      .expect(201);
    expect((heldAgain.body as BookingBody).bookingId).toBe(bookingId);
    expect(await prisma.bookingHold.count({ where: { bookingId, status: 'ACTIVE' } })).toBe(1);

    // Confirm replay: one CONFIRMED history entry.
    const customerId = await appUserId('bkl-customer');
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/request-confirmation`)
      .send({ customerId })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const confirmed = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${auth}`)
      .set('Idempotency-Key', 'confirm-1')
      .expect(201);
    expect((confirmed.body as BookingBody).status).toBe('CONFIRMED');
    const confirmedAgain = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${auth}`)
      .set('Idempotency-Key', 'confirm-1')
      .expect(201);
    expect((confirmedAgain.body as BookingBody).bookingId).toBe(bookingId);
    const history = await prisma.bookingStatusHistory.findMany({
      where: { bookingId, toStatus: 'CONFIRMED' },
    });
    expect(history).toHaveLength(1);
  });
});
