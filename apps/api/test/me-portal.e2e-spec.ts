import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { TenantService } from '../src/tenants/application/tenant.service';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import type { Test as SuperTest } from 'supertest';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-07 / 07-E customer booking portal integration.
 *
 * Authenticated non-member surface: own quotes (07-E04), the per-agency
 * customer record (07-E05), booking creation from an own quote with
 * expiry enforcement (07-E08), confirmation requests with tenant-scoped
 * customer linking (07-E08/07-E05) and own-reservation reads plus
 * CUSTOMER-initiated cancellation (07-E09/07-E10) — with cross-user and
 * cross-tenant leakage checks throughout.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4161;

interface PortalBookingBody {
  bookingId: string;
  tenantId: string;
  agencySlug: string | null;
  bookingNumber: string;
  channel: string;
  status: string;
  customerId: string | null;
  createdBy: string | null;
  quoteId: string | null;
  start: string;
  end: string;
  statusHistory: Array<{ toStatus: string; reason: string | null }>;
}

interface PortalQuoteBody {
  quoteId: string;
  tenantId: string;
  channel: string;
  expired: boolean;
  pricing: { totalMinor: number } | null;
}

describe('Customer booking portal (me-surface, integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let agencyId: string;
  let agencySlug: string;
  let otherAgencyId: string;
  let vehicleId: string;

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

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'ptl-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  async function createTenant(slugPrefix: string, marketplace = true): Promise<{ id: string; slug: string }> {
    const slug = `ptl-${slugPrefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Portal ${slug}`, slug });
    if (marketplace) {
      await tenants.setMarketplaceEnabled(tenant.id, true);
    }
    return { id: tenant.id, slug };
  }

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

  const getAs = (bearer: string, url: string) =>
    api(app).get(url).set('Authorization', `Bearer ${bearer}`);
  const postAs = (bearer: string, url: string) =>
    api(app).post(url).set('Authorization', `Bearer ${bearer}`);

  beforeAll(async () => {
    const agency = await createTenant('a');
    agencyId = agency.id;
    agencySlug = agency.slug;
    otherAgencyId = (await createTenant('b')).id;

    const location = await prisma.location.create({
      data: { name: 'Portal Oran', city: 'Oran', countryCode: 'DZ', latitude: 35.7, longitude: -0.63 },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: agencyId,
        name: 'Portal Branch',
        code: `P${Date.now() % 100000}${Math.floor(Math.random() * 100)}`,
        locationId: location.id,
      },
    });
    const category = await prisma.vehicleCategory.create({
      data: { tenantId: agencyId, code: 'PORTAL-ECO', name: 'Portal Eco' },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId: category.id,
        currentBranchId: branch.id,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `PTL${Date.now() % 1000000}`,
      },
    });
    vehicleId = vehicle.id;
    await prisma.ratePlan.create({
      data: {
        tenantId: agencyId,
        code: `PORTAL-BASE-${Date.now()}`,
        name: 'Portal Base',
        currency: 'DZD',
        durationUnit: 'DAILY',
        baseRateMinor: 4500,
        precedence: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        active: true,
      },
    });
  });

  const futureInterval = () => ({
    start: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
    end: new Date(Date.now() + 2 * 24 * 3600_000 + 3 * 3600_000).toISOString(),
  });

  it('creates a quote for a public agency and lists only the caller’s own quotes (07-E04)', async () => {
    const interval = futureInterval();
    const created = await postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
      .send({ agencySlug, vehicleId, ...interval })
      .expect(201);
    const quote = created.body as PortalQuoteBody;
    expect(quote.tenantId).toBe(agencyId);
    expect(quote.channel).toBe('MARKETPLACE');
    expect(quote.pricing?.totalMinor).toBeGreaterThan(0);

    const own = await getAs(await token('ptl-cust-1'), '/api/v1/me/quotes').expect(200);
    expect((own.body as PortalQuoteBody[]).map((q) => q.quoteId)).toContain(quote.quoteId);

    const foreign = await getAs(await token('ptl-cust-2'), '/api/v1/me/quotes').expect(200);
    expect((foreign.body as PortalQuoteBody[])).toEqual([]);

    await getAs(await token('ptl-cust-2'), `/api/v1/me/quotes/${quote.quoteId}`).expect(404);
    await getAs(await token('ptl-cust-1'), `/api/v1/me/quotes/${quote.quoteId}`).expect(200);
  });

  it('404s quote creation against a hidden agency (07-E04)', async () => {
    const hidden = await createTenant('hidden', false);
    const failure = await errorOf(
      postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
        .send({ agencySlug: hidden.slug, vehicleId, ...futureInterval() }),
    );
    expect(failure.status).toBe(404);
    expect(failure.code).toBe('AGENCY_NOT_FOUND');
  });

  it('resolves-or-creates one customer record per agency (07-E05)', async () => {
    const first = await postAs(await token('ptl-cust-1'), '/api/v1/me/customers/ensure')
      .send({ agencySlug })
      .expect(200);
    const customer = first.body as { id: string; tenantId: string };
    expect(customer.tenantId).toBe(agencyId);

    const second = await postAs(await token('ptl-cust-1'), '/api/v1/me/customers/ensure')
      .send({ agencySlug })
      .expect(200);
    expect((second.body as { id: string }).id).toBe(customer.id);

    const rows = await prisma.customer.findMany({
      where: { tenantId: agencyId, userId: await appUserId('ptl-cust-1') },
    });
    expect(rows).toHaveLength(1);
  });

  it('books from an own quote and hides the booking from other callers (07-E08/07-E09)', async () => {
    const interval = futureInterval();
    const quoteRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
      .send({ agencySlug, vehicleId, ...interval })
      .expect(201);
    const quote = quoteRes.body as PortalQuoteBody;

    const bookingRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/bookings')
      .send({ quoteId: quote.quoteId, idempotencyKey: 'ptl-booking-1' })
      .expect(201);
    const booking = bookingRes.body as PortalBookingBody;
    expect(booking.tenantId).toBe(agencyId);
    expect(booking.agencySlug).toBe(agencySlug);
    expect(booking.status).toBe('DRAFT');
    expect(booking.channel).toBe('MARKETPLACE');

    // Idempotent replay returns the same booking.
    const replay = await postAs(await token('ptl-cust-1'), '/api/v1/me/bookings')
      .send({ quoteId: quote.quoteId, idempotencyKey: 'ptl-booking-1' })
      .expect(201);
    expect((replay.body as PortalBookingBody).bookingId).toBe(booking.bookingId);

    // Own reads only.
    await getAs(await token('ptl-cust-2'), `/api/v1/me/bookings/${booking.bookingId}`).expect(404);
    const detail = await getAs(await token('ptl-cust-1'), `/api/v1/me/bookings/${booking.bookingId}`).expect(200);
    expect((detail.body as PortalBookingBody).bookingNumber).toBe(booking.bookingNumber);
  });

  it('never books from another caller’s quote (07-E08)', async () => {
    const interval = futureInterval();
    const quoteRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
      .send({ agencySlug, vehicleId, ...interval })
      .expect(201);
    const failure = await errorOf(
      postAs(await token('ptl-cust-2'), '/api/v1/me/bookings')
        .send({ quoteId: (quoteRes.body as PortalQuoteBody).quoteId }),
    );
    expect(failure.status).toBe(404);
    expect(failure.code).toBe('QUOTE_NOT_FOUND');
  });

  it('refuses to book an expired quote (07-E08)', async () => {
    const interval = futureInterval();
    const quoteRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
      .send({ agencySlug, vehicleId, ...interval })
      .expect(201);
    const quoteId = (quoteRes.body as PortalQuoteBody).quoteId;
    await prisma.quoteRecord.update({
      where: { id: quoteId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const failure = await errorOf(
      postAs(await token('ptl-cust-1'), '/api/v1/me/bookings').send({ quoteId }),
    );
    expect(failure.status).toBe(409);
    expect(failure.code).toBe('QUOTE_EXPIRED');
  });

  it('confirms with a tenant-scoped customer record and rejects cross-tenant links (07-E05/07-E08)', async () => {
    const interval = futureInterval();
    const quoteRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
      .send({ agencySlug, vehicleId, ...interval })
      .expect(201);
    const bookingRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/bookings')
      .send({ quoteId: (quoteRes.body as PortalQuoteBody).quoteId })
      .expect(201);
    const bookingId = (bookingRes.body as PortalBookingBody).bookingId;

    const ensureRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/customers/ensure')
      .send({ agencySlug })
      .expect(200);
    const customerId = (ensureRes.body as { id: string }).id;

    const confirmed = await postAs(await token('ptl-cust-1'), `/api/v1/me/bookings/${bookingId}/confirm`)
      .send({ customerId })
      .expect(200);
    expect((confirmed.body as PortalBookingBody).status).toBe('PENDING_CONFIRMATION');
    expect((confirmed.body as PortalBookingBody).customerId).toBe(customerId);

    // A customer record from another agency must not be attachable here.
    const foreignCustomer = await prisma.customer.create({
      data: {
        tenantId: otherAgencyId,
        userId: await appUserId('ptl-cust-1'),
        firstName: 'Foreign',
        lastName: 'Customer',
      },
    });
    const otherQuote = await postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
      .send({ agencySlug, vehicleId, ...futureInterval() })
      .expect(201);
    const otherBooking = await postAs(await token('ptl-cust-1'), '/api/v1/me/bookings')
      .send({ quoteId: (otherQuote.body as PortalQuoteBody).quoteId })
      .expect(201);
    const failure = await errorOf(
      postAs(await token('ptl-cust-1'), `/api/v1/me/bookings/${(otherBooking.body as PortalBookingBody).bookingId}/confirm`)
        .send({ customerId: foreignCustomer.id }),
    );
    expect(failure.status).toBe(404);
    expect(failure.code).toBe('BOOKING_CUSTOMER_NOT_FOUND');
  });

  it('lets a customer cancel an own booking with the CUSTOMER initiator (07-E10)', async () => {
    const interval = futureInterval();
    const quoteRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/quotes')
      .send({ agencySlug, vehicleId, ...interval })
      .expect(201);
    const bookingRes = await postAs(await token('ptl-cust-1'), '/api/v1/me/bookings')
      .send({ quoteId: (quoteRes.body as PortalQuoteBody).quoteId })
      .expect(201);
    const bookingId = (bookingRes.body as PortalBookingBody).bookingId;

    await postAs(await token('ptl-cust-2'), `/api/v1/me/bookings/${bookingId}/cancel`)
      .send({ reason: 'not mine' })
      .expect(404);

    const cancelled = await postAs(await token('ptl-cust-1'), `/api/v1/me/bookings/${bookingId}/cancel`)
      .send({ reason: 'changed my mind' })
      .expect(200);
    const body = cancelled.body as PortalBookingBody;
    expect(body.status).toBe('CANCELLED');
    const cancellation = body.statusHistory.find((h) => h.toStatus === 'CANCELLED');
    expect(cancellation?.reason).toBe('booking.cancelled:changed my mind');
  });
});
