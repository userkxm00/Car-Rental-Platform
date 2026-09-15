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
import { RoleValue } from '../src/authorization/roles';
import { TenantService } from '../src/tenants/application/tenant.service';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import type { Test as SuperTest } from 'supertest';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-09 / 09-B integration: the append-only booking ledger (09-B06)
 * and the settlement invoice lifecycle (09-B02/09-B03). The ledger is
 * emitted by the 09-A payment pipeline and by invoice issuance; the
 * tests verify the full event chain, invoice composition from the
 * immutable snapshot, the void-and-reissue correction path, the
 * BILLING_READ / BILLING_MANAGE boundary and tenant isolation.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4174;

interface LedgerBody {
  id: string;
  kind: string;
  description: string | null;
  amountMinor: number;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

interface InvoiceBody {
  id: string;
  invoiceNumber: string;
  status: 'ISSUED' | 'VOIDED';
  currency: string;
  totalMinor: number;
  createdAt: string;
  voidedAt: string | null;
  items: Array<{ kind: string; description: string; amountMinor: number }>;
}

describe('Billing ledger and invoices (09-B, integration)', () => {
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
  let bookingNumber: string;
  let issuedInvoiceId: string;

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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'bil-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  async function createTenant(slugPrefix: string): Promise<{ id: string; slug: string }> {
    const slug = `bil-${slugPrefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Billing ${slug}`, slug });
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

  async function memberToken(subject: string, tenantId: string, roles: RoleValue[]): Promise<string> {
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

  const getAs = (bearer: string, url: string) =>
    api(app).get(url).set('Authorization', `Bearer ${bearer}`);
  const postAs = (bearer: string, url: string, body?: unknown) => {
    let request = api(app).post(url).set('Authorization', `Bearer ${bearer}`);
    if (body !== undefined) {
      request = request.send(body as object);
    }
    return request;
  };

  const ledgerUrl = (booking: string) => `/api/v1/agencies/${agencyId}/bookings/${booking}/ledger`;
  const invoicesUrl = (booking: string) =>
    `/api/v1/agencies/${agencyId}/bookings/${booking}/invoices`;

  beforeAll(async () => {
    const agency = await createTenant('a');
    agencyId = agency.id;
    otherAgencyId = (await createTenant('b')).id;

    const seq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    bookingNumber = `BIL-${seq}`;
    customerUserId = await appUserId('bil-customer');
    const customer = await prisma.customer.create({
      data: {
        tenantId: agencyId,
        userId: customerUserId,
        firstName: 'Lina',
        lastName: 'Hadj',
        preferredLocale: 'fr',
      },
      select: { id: true },
    });

    const createBooking = async (number: string, status: 'CONFIRMED' | 'CANCELLED') =>
      prisma.booking.create({
        data: {
          tenantId: agencyId,
          bookingNumber: number,
          channel: 'STAFF',
          inventoryMode: 'VEHICLE',
          status,
          customerId: customer.id,
          startsAt: new Date(Date.now() + 24 * 3600_000),
          endsAt: new Date(Date.now() + 30 * 3600_000),
        },
        select: { id: true },
      });

    bookingId = (await createBooking(bookingNumber, 'CONFIRMED')).id;
    cancelledBookingId = (await createBooking(`BILC-${seq}`, 'CANCELLED')).id;
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

  it('starts with an empty ledger until money events happen', async () => {
    const bearer = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);
    const res = await getAs(bearer, ledgerUrl(bookingId)).expect(200);
    expect(res.body).toEqual([]);
  });

  it('emits deposit-held and payment-confirmed events from the 09-A pipeline', async () => {
    const bearer = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);

    // Opening the payment intent creates the deposit hold → DEPOSIT_HELD.
    const summary = (
      await getAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/payments`).expect(200)
    ).body as { depositHold: { id: string } | null };
    expect(summary.depositHold?.id).toBeTruthy();

    // Record + confirm a cash payment → PAYMENT_CONFIRMED.
    const record = (
      await postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/payments/records`, {
        method: 'CASH',
        amountMinor: 20000,
      }).expect(201)
    ).body as { id: string };
    await postAs(
      bearer,
      `/api/v1/agencies/${agencyId}/bookings/${bookingId}/payments/records/${record.id}/confirm`,
    ).expect(201);

    const ledger = (await getAs(bearer, ledgerUrl(bookingId)).expect(200)).body as LedgerBody[];
    const held = ledger.find((entry) => entry.kind === 'DEPOSIT_HELD');
    const confirmed = ledger.find((entry) => entry.kind === 'PAYMENT_CONFIRMED');

    expect(held).toMatchObject({
      kind: 'DEPOSIT_HELD',
      amountMinor: 10000,
      sourceType: 'DEPOSIT_HOLD',
      sourceId: summary.depositHold?.id,
    });
    expect(confirmed).toMatchObject({
      kind: 'PAYMENT_CONFIRMED',
      amountMinor: 20000,
      sourceType: 'PAYMENT_RECORD',
      sourceId: record.id,
    });
  });

  it('issues a settlement invoice assembled from the immutable snapshot', async () => {
    const bearer = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);
    const res = await postAs(bearer, invoicesUrl(bookingId)).expect(201);
    const invoice = res.body as InvoiceBody;

    expect(invoice.status).toBe('ISSUED');
    expect(invoice.invoiceNumber).toBe(`INV-${bookingNumber}-001`);
    expect(invoice.currency).toBe('DZD');
    expect(invoice.totalMinor).toBe(45000);
    expect(invoice.items).toHaveLength(2);
    expect(invoice.items[0]).toMatchObject({ kind: 'DEPOSIT', amountMinor: 10000 });
    expect(invoice.items[1]).toMatchObject({ kind: 'RENTAL', amountMinor: 35000 });
    expect(invoice.items.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(45000);
    issuedInvoiceId = invoice.id;

    const ledger = (await getAs(bearer, ledgerUrl(bookingId)).expect(200)).body as LedgerBody[];
    const issued = ledger.filter((entry) => entry.kind === 'INVOICE_ISSUED');
    expect(issued.some((entry) => entry.sourceId === invoice.id)).toBe(true);

    const list = (await getAs(bearer, invoicesUrl(bookingId)).expect(200)).body as InvoiceBody[];
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('ISSUED');
  });

  it('corrects a settlement by void-and-reissue without deleting history', async () => {
    const bearer = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);
    const res = await postAs(bearer, invoicesUrl(bookingId)).expect(201);
    const corrected = res.body as InvoiceBody;

    expect(corrected.invoiceNumber).toBe(`INV-${bookingNumber}-002`);
    const list = (await getAs(bearer, invoicesUrl(bookingId)).expect(200)).body as InvoiceBody[];
    expect(list).toHaveLength(2);
    expect(list.filter((invoice) => invoice.status === 'ISSUED')).toHaveLength(1);
    expect(list.find((invoice) => invoice.id === issuedInvoiceId)?.status).toBe('VOIDED');

    const ledger = (await getAs(bearer, ledgerUrl(bookingId)).expect(200)).body as LedgerBody[];
    expect(ledger.some((entry) => entry.kind === 'INVOICE_VOIDED' && entry.sourceId === issuedInvoiceId)).toBe(true);
    expect(ledger.some((entry) => entry.kind === 'INVOICE_ISSUED' && entry.sourceId === corrected.id)).toBe(true);
    issuedInvoiceId = corrected.id;
  });

  it('voids only issued invoices and records the void in the ledger', async () => {
    const bearer = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);

    const voided = (
      await postAs(bearer, `${invoicesUrl(bookingId)}/${issuedInvoiceId}/void`).expect(201)
    ).body as InvoiceBody;
    expect(voided.status).toBe('VOIDED');
    expect(voided.voidedAt).not.toBeNull();

    const again = await errorOf(postAs(bearer, `${invoicesUrl(bookingId)}/${issuedInvoiceId}/void`));
    expect(again.status).toBe(409);
    expect(again.code).toBe('BILLING_INVOICE_STATE');

    const ledger = (await getAs(bearer, ledgerUrl(bookingId)).expect(200)).body as LedgerBody[];
    expect(ledger.some((entry) => entry.kind === 'INVOICE_VOIDED' && entry.sourceId === issuedInvoiceId)).toBe(true);
  });

  it('refuses invoices for cancelled bookings and unknown bookings', async () => {
    const bearer = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);

    const cancelled = await errorOf(postAs(bearer, invoicesUrl(cancelledBookingId)));
    expect(cancelled.status).toBe(409);
    expect(cancelled.code).toBe('BILLING_BOOKING_NOT_ELIGIBLE');

    const unknown = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/00000000-0000-4000-8000-000000000000/invoices`),
    );
    expect(unknown.status).toBe(404);
    expect(unknown.code).toBe('BILLING_BOOKING_NOT_FOUND');
  });

  it('enforces the BILLING_READ / BILLING_MANAGE boundary', async () => {
    const staffBearer = await memberToken('bil-staff', agencyId, ['STAFF_AGENT']);

    // STAFF_AGENT can read the ledger (docs/37 invoices row = R) …
    await getAs(staffBearer, ledgerUrl(bookingId)).expect(200);
    // … but cannot issue invoices.
    const staffIssue = await errorOf(postAs(staffBearer, invoicesUrl(bookingId)));
    expect(staffIssue.status).toBe(403);

    // FINANCE holds BILLING_MANAGE.
    const financeBearer = await memberToken('bil-finance', agencyId, ['FINANCE']);
    await postAs(financeBearer, invoicesUrl(bookingId)).expect(201);

    // Anonymous callers are rejected.
    const anonymous = await errorOf(api(app).get(ledgerUrl(bookingId)));
    expect(anonymous.status).toBe(401);
  });

  it('isolates billing between tenants', async () => {
    const ownerA = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);
    const ownerB = await memberToken('bil-other-owner', otherAgencyId, ['AGENCY_OWNER_ADMIN']);

    // An owning member of agency A cannot use agency B's path
    // (the scope guard refuses before any lookup).
    const crossPath = await getAs(
      ownerA,
      `/api/v1/agencies/${otherAgencyId}/bookings/${bookingId}/ledger`,
    );
    expect(crossPath.status).toBe(403);

    // Agency B's own member sees nothing for agency A's booking
    // (tenant-scoped lookup yields 404).
    const ownPath = await getAs(
      ownerB,
      `/api/v1/agencies/${otherAgencyId}/bookings/${bookingId}/ledger`,
    );
    expect(ownPath.status).toBe(404);
  });

  it('serves the me-portal ledger and invoices to the booking customer only', async () => {
    const customerBearer = await token('bil-customer');

    const ledger = (await getAs(customerBearer, `/api/v1/me/bookings/${bookingId}/ledger`).expect(200))
      .body as LedgerBody[];
    expect(ledger.some((entry) => entry.kind === 'PAYMENT_CONFIRMED')).toBe(true);

    const invoices = (
      await getAs(customerBearer, `/api/v1/me/bookings/${bookingId}/invoices`).expect(200)
    ).body as InvoiceBody[];
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices.every((invoice) => invoice.currency === 'DZD')).toBe(true);

    const intruder = await memberToken('bil-intruder', otherAgencyId, ['AGENCY_OWNER_ADMIN']);
    const forbidden = await errorOf(
      getAs(intruder, `/api/v1/me/bookings/${bookingId}/ledger`),
    );
    expect(forbidden.status).toBe(404);
  });

  it('offers no write path into the ledger (append-only surface)', async () => {
    const bearer = await memberToken('bil-owner', agencyId, ['AGENCY_OWNER_ADMIN']);
    const attempt = await errorOf(
      postAs(bearer, ledgerUrl(bookingId), { kind: 'PAYMENT_CONFIRMED', amountMinor: 1 }),
    );
    expect(attempt.status).toBe(404);
  });
});
