import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import type { Test as SuperTest } from 'supertest';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-09 / 09-A integration: the payment intent (09-A01), manual
 * records with evidence (09-A02/09-A03), pay-at-agency state (09-A04),
 * partial payments (09-A05), the deposit lifecycle (09-A06) and the
 * manual confirmation workflow (09-A08) — with tenant isolation and the
 * permission boundary.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4173;

interface SummaryBody {
  bookingId: string;
  currency: string;
  totalMinor: number;
  depositMinor: number;
  status: string;
  paidMinor: number;
  outstandingMinor: number;
  records: Array<{ id: string; status: string; amountMinor: number; method: string; reference: string | null }>;
  depositHold: { id: string; status: string; amountMinor: number; releasedById: string | null } | null;
}

interface RecordBody {
  id: string;
  method: string;
  amountMinor: number;
  reference: string | null;
  status: string;
  recordedById: string | null;
  confirmedById: string | null;
}

describe('Rental payments (09-A, integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let agencyId: string;
  let otherAgencyId: string;
  let customerUserId: string;
  let bookingId: string;
  let cancelledBookingId: string;
  let cashRecordId: string;
  let bankRecordId: string;

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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'pay-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  async function createTenant(slugPrefix: string): Promise<{ id: string; slug: string }> {
    const slug = `pay-${slugPrefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Payments ${slug}`, slug });
    await tenants.setMarketplaceEnabled(tenant.id, true);
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

  const getAs = (bearer: string, url: string) =>
    api(app).get(url).set('Authorization', `Bearer ${bearer}`);
  const postAs = (bearer: string, url: string, body?: unknown) => {
    let request = api(app).post(url).set('Authorization', `Bearer ${bearer}`);
    if (body !== undefined) {
      request = request.send(body as object);
    }
    return request;
  };

  const paymentsUrl = (booking: string) => `/api/v1/agencies/${agencyId}/bookings/${booking}/payments`;

  beforeAll(async () => {
    const agency = await createTenant('a');
    agencyId = agency.id;
    otherAgencyId = (await createTenant('b')).id;

    const seq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    customerUserId = await appUserId('pay-customer');
    const customer = await prisma.customer.create({
      data: {
        tenantId: agencyId,
        userId: customerUserId,
        firstName: 'Amine',
        lastName: 'Benyoucef',
        preferredLocale: 'ar',
      },
      select: { id: true },
    });

    const createBooking = async (bookingNumber: string, status: 'CONFIRMED' | 'CANCELLED') =>
      prisma.booking.create({
        data: {
          tenantId: agencyId,
          bookingNumber,
          channel: 'STAFF',
          inventoryMode: 'VEHICLE',
          status,
          customerId: customer.id,
          startsAt: new Date(Date.now() + 24 * 3600_000),
          endsAt: new Date(Date.now() + 30 * 3600_000),
        },
        select: { id: true },
      });

    bookingId = (await createBooking(`PAY-${seq}`, 'CONFIRMED')).id;
    cancelledBookingId = (await createBooking(`PAYC-${seq}`, 'CANCELLED')).id;
    await prisma.bookingPriceSnapshot.create({
      data: {
        bookingId,
        pricingJson: {
          currency: 'DZD',
          totalMinor: 45000,
          depositMinor: 10000,
          breakdown: [{ code: 'RENTAL', amountMinor: 45000 }],
          calculatedAt: new Date().toISOString(),
        },
      },
    });
  });

  it('opens the intent lazily from the price snapshot with the deposit held', async () => {
    const bearer = await agencyToken('pay-owner', agencyId);
    const res = await getAs(bearer, paymentsUrl(bookingId)).expect(200);
    const body = res.body as SummaryBody;

    expect(body.bookingId).toBe(bookingId);
    expect(body.currency).toBe('DZD');
    expect(body.totalMinor).toBe(45000);
    expect(body.depositMinor).toBe(10000);
    expect(body.status).toBe('OPEN');
    expect(body.paidMinor).toBe(0);
    expect(body.outstandingMinor).toBe(45000);
    expect(body.records).toEqual([]);
    expect(body.depositHold?.status).toBe('HELD');
    expect(body.depositHold?.amountMinor).toBe(10000);
  });

  it('records manual payments and requires bank transfer evidence', async () => {
    const bearer = await agencyToken('pay-owner', agencyId);

    const noReference = await errorOf(
      postAs(bearer, `${paymentsUrl(bookingId)}/records`, { method: 'BANK_TRANSFER', amountMinor: 25000 }),
    );
    expect(noReference.status).toBe(409);
    expect(noReference.code).toBe('PAYMENT_RECORD_INPUT_INVALID');

    const invalidAmount = await errorOf(
      postAs(bearer, `${paymentsUrl(bookingId)}/records`, { method: 'CASH', amountMinor: -5 }),
    );
    expect(invalidAmount.status).toBe(409);
    expect(invalidAmount.code).toBe('PAYMENT_RECORD_INPUT_INVALID');

    const cash = await postAs(bearer, `${paymentsUrl(bookingId)}/records`, {
      method: 'CASH',
      amountMinor: 20000,
      note: 'counter payment',
    }).expect(201);
    const cashBody = cash.body as RecordBody;
    expect(cashBody.status).toBe('PENDING_CONFIRMATION');
    expect(cashBody.method).toBe('CASH');
    expect(cashBody.recordedById).not.toBeNull();
    cashRecordId = cashBody.id;

    const bank = await postAs(bearer, `${paymentsUrl(bookingId)}/records`, {
      method: 'BANK_TRANSFER',
      amountMinor: 25000,
      reference: 'VIR-2026-0001',
    }).expect(201);
    const bankBody = bank.body as RecordBody;
    expect(bankBody.reference).toBe('VIR-2026-0001');
    bankRecordId = bankBody.id;

    // Pending records do not settle money (09-A04/09-A08).
    const summary = (await getAs(bearer, paymentsUrl(bookingId)).expect(200)).body as SummaryBody;
    expect(summary.status).toBe('OPEN');
    expect(summary.paidMinor).toBe(0);
  });

  it('settles through the manual confirmation workflow and derives the balance', async () => {
    const bearer = await agencyToken('pay-owner', agencyId);

    await postAs(bearer, `${paymentsUrl(bookingId)}/records/${cashRecordId}/confirm`).expect(201);

    const partial = (await getAs(bearer, paymentsUrl(bookingId)).expect(200)).body as SummaryBody;
    expect(partial.status).toBe('PARTIALLY_SETTLED');
    expect(partial.paidMinor).toBe(20000);
    expect(partial.outstandingMinor).toBe(25000);

    await postAs(bearer, `${paymentsUrl(bookingId)}/records/${bankRecordId}/confirm`).expect(201);

    const settled = (await getAs(bearer, paymentsUrl(bookingId)).expect(200)).body as SummaryBody;
    expect(settled.status).toBe('SETTLED');
    expect(settled.paidMinor).toBe(45000);
    expect(settled.outstandingMinor).toBe(0);
    expect(settled.records.filter((record) => record.status === 'CONFIRMED')).toHaveLength(2);

    const duplicate = await errorOf(
      postAs(bearer, `${paymentsUrl(bookingId)}/records/${cashRecordId}/confirm`),
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.code).toBe('PAYMENT_RECORD_STATE');
  });

  it('guards the outstanding balance at record and confirm time and voids only pending records', async () => {
    const bearer = await agencyToken('pay-owner', agencyId);

    // The main booking is fully settled: any further record is refused.
    const over = await errorOf(
      postAs(bearer, `${paymentsUrl(bookingId)}/records`, { method: 'CASH', amountMinor: 1 }),
    );
    expect(over.status).toBe(409);
    expect(over.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');

    // A second booking exercises the confirm-time gate: a pending record
    // stays legal at record time but the outstanding can shrink before
    // confirmation (concurrent settlement).
    const seq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const second = await prisma.booking.create({
      data: {
        tenantId: agencyId,
        bookingNumber: `PAY2-${seq}`,
        channel: 'STAFF',
        inventoryMode: 'VEHICLE',
        status: 'CONFIRMED',
        startsAt: new Date(Date.now() + 24 * 3600_000),
        endsAt: new Date(Date.now() + 30 * 3600_000),
      },
      select: { id: true },
    });
    await prisma.bookingPriceSnapshot.create({
      data: {
        bookingId: second.id,
        pricingJson: { currency: 'DZD', totalMinor: 45000, depositMinor: 0 },
      },
    });
    const secondPayments = paymentsUrl(second.id);

    await getAs(bearer, secondPayments).expect(200);
    const pending = await postAs(bearer, `${secondPayments}/records`, {
      method: 'CASH',
      amountMinor: 20000,
    }).expect(201);
    const pendingId = (pending.body as RecordBody).id;
    const filler = await postAs(bearer, `${secondPayments}/records`, {
      method: 'CASH',
      amountMinor: 5000,
    }).expect(201);
    await postAs(bearer, `${secondPayments}/records/${(filler.body as RecordBody).id}/confirm`).expect(201);

    // 20000 pending + 5000 confirmed = 25000; confirming the pending 20000
    // stays inside 45000 → settles at 25000.
    await postAs(bearer, `${secondPayments}/records/${pendingId}/confirm`).expect(201);

    // Now record a pending 10000 while 25000 is confirmed (fits), then
    // settle the remaining 20000 and try to confirm the late record —
    // the confirm-time gate must refuse (25000 + 20000 + 10000 > 45000).
    const late = await postAs(bearer, `${secondPayments}/records`, {
      method: 'CASH',
      amountMinor: 10000,
    }).expect(201);
    const lateId = (late.body as RecordBody).id;
    const headroom = await postAs(bearer, `${secondPayments}/records`, {
      method: 'CASH',
      amountMinor: 20000,
    }).expect(201);
    await postAs(bearer, `${secondPayments}/records/${(headroom.body as RecordBody).id}/confirm`).expect(201);
    const overConfirm = await errorOf(
      postAs(bearer, `${secondPayments}/records/${lateId}/confirm`),
    );
    expect(overConfirm.status).toBe(409);
    expect(overConfirm.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');

    // The rejected pending record can still be voided; confirmed money never voids.
    const voided = await postAs(bearer, `${secondPayments}/records/${lateId}/void`).expect(201);
    expect((voided.body as RecordBody).status).toBe('VOIDED');

    const voidConfirmed = await errorOf(
      postAs(bearer, `${paymentsUrl(bookingId)}/records/${cashRecordId}/void`),
    );
    expect(voidConfirmed.status).toBe(409);
    expect(voidConfirmed.code).toBe('PAYMENT_RECORD_STATE');
  });

  it('releases the deposit only after the rental returns', async () => {
    const bearer = await agencyToken('pay-owner', agencyId);

    const tooEarly = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/deposit/release`, {}),
    );
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.code).toBe('PAYMENT_DEPOSIT_NOT_RELEASABLE');

    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'RETURNED' } });

    const released = await postAs(
      bearer,
      `/api/v1/agencies/${agencyId}/bookings/${bookingId}/deposit/release`,
      { note: 'returned in good condition' },
    ).expect(201);
    expect((released.body as SummaryBody['depositHold'] & { status: string }).status).toBe('RELEASED');
    expect((released.body as { releasedById: string | null }).releasedById).not.toBeNull();

    const duplicateRelease = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/deposit/release`, {}),
    );
    expect(duplicateRelease.status).toBe(409);
    expect(duplicateRelease.code).toBe('PAYMENT_DEPOSIT_STATE');
  });

  it('lets the booking customer read their own payment state', async () => {
    const bearer = await token('pay-customer');
    const res = await getAs(bearer, `/api/v1/me/bookings/${bookingId}/payments`).expect(200);
    const body = res.body as SummaryBody;
    expect(body.status).toBe('SETTLED');
    expect(body.depositHold?.status).toBe('RELEASED');

    const intruder = await token('pay-intruder');
    await appUserId('pay-intruder');
    const foreign = await getAs(intruder, `/api/v1/me/bookings/${bookingId}/payments`);
    expect(foreign.status).toBe(404);
  });

  it('rejects ineligible bookings, unknown ids and enforces the permission boundary', async () => {
    const bearer = await agencyToken('pay-owner', agencyId);

    const cancelled = await errorOf(getAs(bearer, paymentsUrl(cancelledBookingId)));
    expect(cancelled.status).toBe(409);
    expect(cancelled.code).toBe('PAYMENT_BOOKING_NOT_ELIGIBLE');

    const unknown = await errorOf(getAs(bearer, paymentsUrl(randomUUID())));
    expect(unknown.status).toBe(404);
    expect(unknown.code).toBe('PAYMENT_BOOKING_NOT_FOUND');

    // STAFF_AGENT reads but cannot record.
    const staffSubject = 'pay-staff';
    const staffUserId = await appUserId(staffSubject);
    const membership = (await memberships.listForTenant(agencyId)).find((m) => m.userId === staffUserId);
    if (!membership) {
      await memberships.invite(agencyId, staffUserId, ['STAFF_AGENT']);
    }
    const accepted = (await memberships.listForTenant(agencyId)).find((m) => m.userId === staffUserId);
    if (accepted) {
      await memberships.accept(staffUserId, accepted.id);
    }
    const staffBearer = await token(staffSubject);

    await getAs(staffBearer, paymentsUrl(bookingId)).expect(200);
    const denied = await errorOf(
      postAs(staffBearer, `${paymentsUrl(bookingId)}/records`, { method: 'CASH', amountMinor: 1 }),
    );
    expect(denied.status).toBe(403);
  });

  it('isolates payments across tenants', async () => {
    const bearer = await agencyToken('pay-owner', agencyId);
    const otherBearer = await agencyToken('pay-other-owner', otherAgencyId);

    // The other agency's own member cannot reach the booking through
    // their tenant path (tenant-scoped lookup yields 404).
    const foreignPath = await getAs(
      otherBearer,
      `/api/v1/agencies/${otherAgencyId}/bookings/${bookingId}/payments`,
    );
    expect(foreignPath.status).toBe(404);

    // A member of the owning agency cannot use the foreign tenant path
    // (the agency scope guard refuses before any lookup).
    const foreignScope = await getAs(
      bearer,
      `/api/v1/agencies/${otherAgencyId}/bookings/${bookingId}/payments`,
    );
    expect(foreignScope.status).toBe(403);

    const unauth = await api(app).get(paymentsUrl(bookingId));
    expect(unauth.status).toBe(401);
  });
});
