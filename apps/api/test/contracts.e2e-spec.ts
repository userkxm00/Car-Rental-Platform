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
import { LocalTempObjectStorage } from '../src/media/infrastructure/local-temp-object-storage';
import { ObjectStorage } from '../src/media/ports/object-storage.port';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import type { Test as SuperTest } from 'supertest';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-08 / 08-C integration: contract issuance with the rendered
 * snapshot (08-C01/08-C02), the signature boundary (08-C03), receipts
 * (08-C05) and generated-document downloads (08-C06), including the
 * me-portal customer surface and cross-tenant isolation.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4172;

interface ContractBody {
  id: string;
  bookingId: string;
  contractNumber: string;
  status: string;
  locale: string;
  snapshot: {
    templateCode: string;
    templateVersion: number | null;
    locale: string;
    contentHash: string;
    title: string;
  } | null;
  signature: { method: string; signerRole: string; signerName: string; contentHash: string } | null;
  document: {
    id: string;
    title: string;
    contentType: string;
    sizeBytes: number;
    retainUntil: string | null;
    revokedAt: string | null;
  } | null;
}

interface ReceiptBody {
  id: string;
  receiptNumber: string;
  totals: { currency: string; totalMinor: number; depositMinor: number };
  document: { id: string } | null;
}

interface DownloadBody {
  url: string | null;
  expiresAt: string | null;
  retainUntil: string | null;
  revokedAt: string | null;
}

interface AccessHistoryBody {
  documentId: string;
  events: Array<{ action: string; channel: string; actorUserId: string | null; createdAt: string }>;
}

describe('Rental contracts, signatures, receipts (08-C, integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let storage: LocalTempObjectStorage;
  let agencyId: string;
  let otherAgencyId: string;
  let customerUserId: string;
  let bookingId: string;
  let bookingNumber: string;
  let receiptDocumentId: string;
  let vehicleId: string;
  let pickupBranchId: string;
  let returnBranchId: string;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const env = loadEnvSchema({
      NODE_ENV: 'test',
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      TEST_DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    storage = new LocalTempObjectStorage();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(env)
      .overrideProvider(ObjectStorage)
      .useValue(storage)
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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'ctr-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  async function createTenant(slugPrefix: string): Promise<{ id: string; slug: string }> {
    const slug = `ctr-${slugPrefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Contracts ${slug}`, slug });
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

  beforeAll(async () => {
    const agency = await createTenant('a');
    agencyId = agency.id;
    otherAgencyId = (await createTenant('b')).id;

    const location = await prisma.location.create({
      data: {
        name: 'Contracts Oran',
        city: 'Oran',
        countryCode: 'DZ',
        latitude: 35.7,
        longitude: -0.63,
      },
    });
    const createBranch = async (name: string, code: string) =>
      prisma.branch.create({
        data: {
          tenantId: agencyId,
          name,
          code,
          locationId: location.id,
          contacts: { phone: '+213550000001' },
        },
        select: { id: true },
      });
    const seq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    pickupBranchId = (await createBranch('Pickup Oran Centre', `PC${seq}`)).id;
    returnBranchId = (await createBranch('Return Oran Airport', `RA${seq}`)).id;

    const category = await prisma.vehicleCategory.create({
      data: { tenantId: agencyId, name: 'Sedan', code: `SD${seq}` },
      select: { id: true },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId: category.id,
        make: 'Mercedes',
        model: 'C220',
        year: 2024,
        plateNumber: `PLATE-${seq}`,
        currentBranchId: pickupBranchId,
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;

    customerUserId = await appUserId('ctr-customer');
    const customer = await prisma.customer.create({
      data: {
        tenantId: agencyId,
        userId: customerUserId,
        firstName: 'Amine',
        lastName: 'Benyoucef',
        preferredLocale: 'ar',
        licenseNumber: '11223344',
        licenseCountry: 'DZ',
      },
      select: { id: true },
    });
    await prisma.customerDocument.create({
      data: {
        customerId: customer.id,
        type: 'DRIVER_LICENSE',
        number: '11223344',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });

    bookingNumber = `CTR-${seq}`;
    const booking = await prisma.booking.create({
      data: {
        tenantId: agencyId,
        bookingNumber,
        channel: 'STAFF',
        inventoryMode: 'VEHICLE',
        status: 'CONFIRMED',
        customerId: customer.id,
        assignedVehicleId: vehicleId,
        pickupBranchId,
        returnBranchId,
        startsAt: new Date(Date.now() + 1 * 24 * 3600_000),
        endsAt: new Date(Date.now() + 1 * 24 * 3600_000 + 6 * 3600_000),
      },
      select: { id: true },
    });
    bookingId = booking.id;
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

  it('issues a contract with the rendered snapshot and a generated PDF', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const res = await postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/contracts`, {}).expect(201);
    const body = res.body as ContractBody;

    expect(body.contractNumber).toBe(`CT-${bookingNumber}`);
    expect(body.status).toBe('ISSUED');
    expect(body.locale).toBe('ar'); // customer preferredLocale ar
    expect(body.snapshot).not.toBeNull();
    expect(body.snapshot!.templateCode).toBe('RENTAL_CONTRACT');
    expect(body.snapshot!.locale).toBe('ar');
    expect(body.snapshot!.title).toContain('عقد');
    expect(body.snapshot!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.document).not.toBeNull();
    expect(body.document!.contentType).toBe('application/pdf');
    expect(body.document!.sizeBytes).toBeGreaterThan(100);
    expect(storage.objects.size).toBeGreaterThanOrEqual(1);
  });

  it('rejects a second issuance for the same booking', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const { status, code } = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/contracts`, {}),
    );
    expect(status).toBe(409);
    expect(code).toBe('CONTRACT_EXISTS');
  });

  it('lists the booking contract through the staff surface', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const res = await getAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/contracts`).expect(200);
    const list = res.body as { items: ContractBody[] };
    expect(list.items).toHaveLength(1);
    expect(list.items[0].status).toBe('ISSUED');
  });

  it('signs the contract on site and keeps the signature evidence', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const contract = (
      await getAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/contracts`).expect(200)
    ).body as { items: ContractBody[] };
    const contractId = contract.items[0].id;
    const before = storage.objects.size;

    const res = await postAs(bearer, `/api/v1/agencies/${agencyId}/contracts/${contractId}/signature`, {
      method: 'ON_SITE',
      signerRole: 'AGENCY_REPRESENTATIVE',
      signerName: 'Brahim',
    }).expect(201);
    const body = res.body as ContractBody;

    expect(body.status).toBe('SIGNED');
    expect(body.signature).not.toBeNull();
    expect(body.signature!.method).toBe('ON_SITE');
    expect(body.signature!.signerName).toBe('Brahim');
    expect(body.signature!.contentHash).toBe(body.snapshot!.contentHash);
    // The signed PDF was regenerated and uploaded.
    expect(storage.objects.size).toBe(before + 1);
  });

  it('rejects a duplicate signature', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const contract = (
      await getAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/contracts`).expect(200)
    ).body as { items: ContractBody[] };
    const { status, code } = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/contracts/${contract.items[0].id}/signature`, {
        method: 'ON_SITE',
        signerRole: 'AGENCY_REPRESENTATIVE',
        signerName: 'Brahim',
      }),
    );
    expect(status).toBe(409);
    expect(code).toBe('SIGNATURE_EXISTS');
  });

  it('generates a receipt tracing the price snapshot and serves a download URL', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const res = await postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/receipts`).expect(201);
    const body = res.body as ReceiptBody;

    expect(body.receiptNumber).toContain('RT-');
    expect(body.totals).toEqual({ currency: 'DZD', totalMinor: 45000, depositMinor: 10000 });
    expect(body.document).not.toBeNull();
    receiptDocumentId = body.document!.id;

    const download = await getAs(
      bearer,
      `/api/v1/agencies/${agencyId}/documents/${body.document!.id}/url`,
    ).expect(200);
    const downloadBody = download.body as DownloadBody;
    expect(downloadBody.url).toContain('https://');
    expect(downloadBody.expiresAt).not.toBeNull();
    expect(new Date(downloadBody.expiresAt as string).getTime()).toBeGreaterThan(Date.now());

    const dup = await errorOf(postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/receipts`));
    expect(dup.status).toBe(409);
    expect(dup.code).toBe('RECEIPT_EXISTS');
  });

  it('lets the booking customer read and download their own documents', async () => {
    const bearer = await token('ctr-customer');

    const contracts = await getAs(bearer, `/api/v1/me/bookings/${bookingId}/contracts`).expect(200);
    const list = contracts.body as { items: ContractBody[] };
    expect(list.items).toHaveLength(1);
    const contractId = list.items[0].id;

    const contract = await getAs(bearer, `/api/v1/me/contracts/${contractId}`).expect(200);
    expect((contract.body as ContractBody).signature).not.toBeNull();

    const receipts = await getAs(bearer, `/api/v1/me/bookings/${bookingId}/receipts`).expect(200);
    const receiptList = receipts.body as { items: ReceiptBody[] };
    expect(receiptList.items).toHaveLength(1);

    const documentId = receiptList.items[0].document!.id;
    const download = await getAs(bearer, `/api/v1/me/documents/${documentId}/url`).expect(200);
    expect((download.body as DownloadBody).url).toContain('https://');
  });

  it('secures generated documents: retention, revocation, restore and the access trail (08-D)', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const customerBearer = await token('ctr-customer');

    // 08-D04: the generated PDF records its retention horizon at creation.
    const receipt = await getAs(bearer, `/api/v1/agencies/${agencyId}/receipts`).expect(200);
    const receiptList = receipt.body as { items: ReceiptBody[] };
    const receiptWithDocument = receiptList.items.find((item) => item.document?.id === receiptDocumentId);
    expect(receiptWithDocument).toBeDefined();

    // 08-D05: staff revocation stops further URL issuance everywhere.
    const revoked = await postAs(
      bearer,
      `/api/v1/agencies/${agencyId}/documents/${receiptDocumentId}/revoke`,
    ).expect(201);
    const revokedBody = revoked.body as DownloadBody;
    expect(revokedBody.url).toBeNull();
    expect(revokedBody.expiresAt).toBeNull();
    expect(revokedBody.revokedAt).not.toBeNull();
    expect(revokedBody.retainUntil).not.toBeNull();

    const staffDenied = await errorOf(
      getAs(bearer, `/api/v1/agencies/${agencyId}/documents/${receiptDocumentId}/url`),
    );
    expect(staffDenied.status).toBe(409);
    expect(staffDenied.code).toBe('DOCUMENT_ACCESS_REVOKED');

    const customerDenied = await errorOf(
      getAs(customerBearer, `/api/v1/me/documents/${receiptDocumentId}/url`),
    );
    expect(customerDenied.status).toBe(409);
    expect(customerDenied.code).toBe('DOCUMENT_ACCESS_REVOKED');

    const duplicateRevoke = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/documents/${receiptDocumentId}/revoke`),
    );
    expect(duplicateRevoke.status).toBe(409);
    expect(duplicateRevoke.code).toBe('DOCUMENT_REVOKE_STATE');

    // 08-D05: restore re-enables issuance; downloads work again.
    const restored = await postAs(
      bearer,
      `/api/v1/agencies/${agencyId}/documents/${receiptDocumentId}/restore`,
    ).expect(201);
    expect((restored.body as DownloadBody).revokedAt).toBeNull();
    await getAs(bearer, `/api/v1/agencies/${agencyId}/documents/${receiptDocumentId}/url`).expect(200);

    // 08-D03: the append-only access trail records every grant and
    // revocation with the acting user and channel.
    const history = await getAs(
      bearer,
      `/api/v1/agencies/${agencyId}/documents/${receiptDocumentId}/access-history`,
    ).expect(200);
    const historyBody = history.body as AccessHistoryBody;
    expect(historyBody.documentId).toBe(receiptDocumentId);
    expect(historyBody.events.map((event) => event.action)).toContain('URL_ISSUED');
    expect(historyBody.events.map((event) => event.action)).toContain('ACCESS_REVOKED');
    expect(historyBody.events.map((event) => event.action)).toContain('ACCESS_RESTORED');
    const channels = historyBody.events.filter((event) => event.action === 'URL_ISSUED').map((event) => event.channel);
    expect(channels).toContain('STAFF');
    expect(channels).toContain('CUSTOMER');

    // Cross-tenant: a foreign agency cannot revoke or read the trail.
    const otherBearer = await agencyToken('ctr-other-owner', otherAgencyId);
    const foreignRevoke = await errorOf(
      postAs(otherBearer, `/api/v1/agencies/${otherAgencyId}/documents/${receiptDocumentId}/revoke`),
    );
    expect(foreignRevoke.status).toBe(404);
    expect(foreignRevoke.code).toBe('CONTRACT_DOCUMENT_NOT_FOUND');

    // Permission boundary: contract.read users cannot revoke documents.
    const staffUserId = await appUserId('ctr-staff');
    const staffExisting = (await memberships.listForTenant(agencyId)).find(
      (membership) => membership.userId === staffUserId,
    );
    if (!staffExisting) {
      await memberships.invite(agencyId, staffUserId, ['STAFF_AGENT']);
    }
    const staffMembership = (await memberships.listForTenant(agencyId)).find(
      (membership) => membership.userId === staffUserId,
    );
    expect(staffMembership).toBeDefined();
    await memberships.accept(staffUserId, staffMembership!.id);
    const staffBearer = await token('ctr-staff');
    const staffRevoke = await errorOf(
      postAs(staffBearer, `/api/v1/agencies/${agencyId}/documents/${receiptDocumentId}/revoke`),
    );
    expect(staffRevoke.status).toBe(403);
  });

  it('denies other users access to the customer documents', async () => {
    const bearer = await token('ctr-intruder');
    await appUserId('ctr-intruder');
    const contracts = await getAs(bearer, `/api/v1/me/bookings/${bookingId}/contracts`);
    expect(contracts.status).toBe(404);
  });

  it('isolates contracts across tenants', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const otherBearer = await agencyToken('ctr-other-owner', otherAgencyId);
    const contracts = (
      await getAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/contracts`).expect(200)
    ).body as { items: ContractBody[] };
    const contractId = contracts.items[0].id;

    const crossTenant = await getAs(otherBearer, `/api/v1/agencies/${otherAgencyId}/contracts/${contractId}`);
    expect(crossTenant.status).toBe(404);
  });

  it('enforces the contract permission boundary', async () => {
    // A member without contract permissions cannot issue contracts.
    const staffSubject = 'ctr-staff';
    const staffUserId = await appUserId(staffSubject);
    const membership = (await memberships.listForTenant(agencyId)).find((m) => m.userId === staffUserId);
    if (!membership) {
      await memberships.invite(agencyId, staffUserId, ['STAFF_AGENT']);
    }
    const acceptedMembership = (await memberships.listForTenant(agencyId)).find((m) => m.userId === staffUserId);
    if (acceptedMembership) {
      await memberships.accept(staffUserId, acceptedMembership.id);
    }
    const bearer = await token(staffSubject);

    const denied = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${bookingId}/receipts`),
    );
    expect(denied.status).toBe(403);
  });

  it('rejects issuance for unknown bookings and unauthenticated callers', async () => {
    const bearer = await agencyToken('ctr-owner', agencyId);
    const missing = await errorOf(
      postAs(bearer, `/api/v1/agencies/${agencyId}/bookings/${randomUUID()}/contracts`, {}),
    );
    expect(missing.status).toBe(404);
    expect(missing.code).toBe('CONTRACT_BOOKING_NOT_FOUND');

    const unauth = await api(app).get(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/contracts`);
    expect(unauth.status).toBe(401);
  });
});
