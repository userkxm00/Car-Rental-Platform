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
import type { Test as SuperTest } from 'supertest';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-08 / 08-A integration: the agency document policy (08-A02), the
 * required-document resolution with the foreign-driver passport rule
 * (08-A03), the booking document checklist with expiry evaluation
 * (08-A04/08-A05) and the READY_FOR_PICKUP gate inside markReady.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4170;

interface PolicyBody {
  requiredTypes: string[];
  requirePassportForForeignLicense: boolean;
  configured: boolean;
}

interface ChecklistBody {
  bookingId: string;
  customerLinked: boolean;
  required: string[];
  items: Array<{ type: string; status: string; expiresAt: string | null }>;
  complete: boolean;
}

interface ReadyBody {
  bookingId: string;
  status: string;
  statusHistory: Array<{ toStatus: string; reason: string | null }>;
}

describe('Documents policy and booking checklist (08-A, integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let agencyId: string;
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
    memberships = app.get(MembershipService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'doc-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  async function createTenant(slugPrefix: string): Promise<{ id: string; slug: string }> {
    const slug = `doc-${slugPrefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Documents ${slug}`, slug });
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

  /** An agency member token (AGENCY_OWNER_ADMIN carries every agency permission). */
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
  const putAs = (bearer: string, url: string) =>
    api(app).put(url).set('Authorization', `Bearer ${bearer}`);
  const postAs = (bearer: string, url: string) =>
    api(app).post(url).set('Authorization', `Bearer ${bearer}`);

  async function createCustomer(
    tenantId: string,
    licenseCountry: string | null,
  ): Promise<{ id: string }> {
    const seq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return prisma.customer.create({
      data: {
        tenantId,
        firstName: 'Doc',
        lastName: `Customer ${seq}`,
        licenseCountry,
      },
      select: { id: true },
    });
  }

  async function createBooking(overrides: {
    customerId: string | null;
    status?: 'CONFIRMED';
    assignedVehicleId?: string | null;
    endsAt?: Date;
  }): Promise<{ id: string }> {
    const seq = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return prisma.booking.create({
      data: {
        tenantId: agencyId,
        bookingNumber: `DOC-${seq}`,
        channel: 'STAFF',
        inventoryMode: 'VEHICLE',
        status: overrides.status ?? 'DRAFT',
        customerId: overrides.customerId,
        assignedVehicleId: overrides.assignedVehicleId ?? null,
        startsAt: new Date(Date.now() + 2 * 24 * 3600_000),
        endsAt: overrides.endsAt ?? new Date(Date.now() + 2 * 24 * 3600_000 + 3 * 3600_000),
      },
      select: { id: true },
    });
  }

  async function addDocument(
    customerId: string,
    type: 'DRIVER_LICENSE' | 'PASSPORT',
    status: 'VERIFIED' | 'PENDING',
    expiryDate: Date,
  ): Promise<void> {
    await prisma.customerDocument.create({
      data: { customerId, type, status, number: `NUM-${Date.now()}`, expiryDate },
    });
  }

  beforeAll(async () => {
    const agency = await createTenant('a');
    agencyId = agency.id;
    otherAgencyId = (await createTenant('b')).id;

    const location = await prisma.location.create({
      data: { name: 'Documents Oran', city: 'Oran', countryCode: 'DZ', latitude: 35.7, longitude: -0.63 },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: agencyId,
        name: 'Documents Branch',
        code: `D${Date.now() % 100000}${Math.floor(Math.random() * 100)}`,
        locationId: location.id,
      },
    });
    const category = await prisma.vehicleCategory.create({
      data: { tenantId: agencyId, code: 'DOC-ECO', name: 'Documents Eco' },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId: category.id,
        currentBranchId: branch.id,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `DOC${Date.now() % 1000000}`,
      },
    });
    vehicleId = vehicle.id;
  });

  it('returns the default policy until the agency configures one, and is tenant-scoped (08-A02)', async () => {
    const own = await getAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/document-policy`,
    ).expect(200);
    expect(own.body).toEqual({
      requiredTypes: [],
      requirePassportForForeignLicense: false,
      configured: false,
    });

    const foreign = await getAs(
      await agencyToken('doc-other-admin', otherAgencyId),
      `/api/v1/agencies/${agencyId}/document-policy`,
    ).expect(403);

    const unauthenticated = await errorOf(
      api(app).get(`/api/v1/agencies/${agencyId}/document-policy`),
    );
    expect(unauthenticated.status).toBe(401);
    expect(foreign.status).toBe(403);
  });

  it('reports a walk-in booking as unlinked with every required type NOT_SUBMITTED (08-A04)', async () => {
    // Runs before any policy is configured: default policy = license only.
    const booking = await createBooking({ customerId: null });
    const checklist = await getAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/bookings/${booking.id}/documents`,
    ).expect(200);
    const body = checklist.body as ChecklistBody;
    expect(body.customerLinked).toBe(false);
    expect(body.required).toEqual(['DRIVER_LICENSE']);
    expect(body.items).toEqual([{ type: 'DRIVER_LICENSE', status: 'NOT_SUBMITTED', expiresAt: null }]);
    expect(body.complete).toBe(false);
  });

  it('persists a validated policy and rejects unknown document types (08-A02)', async () => {
    const updated = await putAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/document-policy`,
    )
      .send({ requiredTypes: ['NATIONAL_ID', 'PASSPORT', 'NATIONAL_ID'], requirePassportForForeignLicense: true })
      .expect(200);
    expect(updated.body as PolicyBody).toMatchObject({
      requiredTypes: ['NATIONAL_ID', 'PASSPORT'],
      requirePassportForForeignLicense: true,
      configured: true,
    });

    const readBack = await getAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/document-policy`,
    ).expect(200);
    expect(readBack.body as PolicyBody).toMatchObject({
      requiredTypes: ['NATIONAL_ID', 'PASSPORT'],
      requirePassportForForeignLicense: true,
      configured: true,
    });

    const invalid = await errorOf(
      putAs(await agencyToken('doc-admin', agencyId), `/api/v1/agencies/${agencyId}/document-policy`).send({
        requiredTypes: ['FAKE_TYPE'],
      }),
    );
    expect(invalid.status).toBe(409);
    expect(invalid.code).toBe('INVALID_DOCUMENT_TYPES');
  });


  it('adds the passport requirement for a foreign-license customer and tracks verification (08-A03/08-A04)', async () => {
    // Narrow the policy for this scenario: passport rule on, no extra types.
    await putAs(await agencyToken('doc-admin', agencyId), `/api/v1/agencies/${agencyId}/document-policy`)
      .send({ requiredTypes: [], requirePassportForForeignLicense: true })
      .expect(200);

    const customer = await createCustomer(agencyId, 'FR');
    const booking = await createBooking({ customerId: customer.id });
    await addDocument(customer.id, 'DRIVER_LICENSE', 'VERIFIED', new Date('2030-01-01T00:00:00Z'));

    const checklist = await getAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/bookings/${booking.id}/documents`,
    ).expect(200);
    const body = checklist.body as ChecklistBody;
    expect(body.customerLinked).toBe(true);
    expect(body.required).toEqual(['DRIVER_LICENSE', 'PASSPORT']);
    expect(body.items.map((item) => item.status)).toEqual(['VERIFIED', 'NOT_SUBMITTED']);
    expect(body.complete).toBe(false);
  });

  it('is complete only when every required document is VERIFIED through the return (08-A04/08-A05)', async () => {
    const customer = await createCustomer(agencyId, 'FR');
    const booking = await createBooking({ customerId: customer.id });
    await addDocument(customer.id, 'DRIVER_LICENSE', 'VERIFIED', new Date('2030-01-01T00:00:00Z'));
    await addDocument(customer.id, 'PASSPORT', 'VERIFIED', new Date('2030-01-01T00:00:00Z'));

    const complete = await getAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/bookings/${booking.id}/documents`,
    ).expect(200);
    expect((complete.body as ChecklistBody).complete).toBe(true);
  });

  it('marks a document EXPIRED when it lapses before the rental ends (08-A05)', async () => {
    const customer = await createCustomer(agencyId, 'FR');
    const booking = await createBooking({
      customerId: customer.id,
      endsAt: new Date(Date.now() + 5 * 24 * 3600_000),
    });
    await addDocument(customer.id, 'DRIVER_LICENSE', 'VERIFIED', new Date('2030-01-01T00:00:00Z'));
    // Passport expires mid-rental: valid today, invalid before the return.
    await addDocument(customer.id, 'PASSPORT', 'VERIFIED', new Date(Date.now() + 4 * 24 * 3600_000));

    const checklist = await getAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/bookings/${booking.id}/documents`,
    ).expect(200);
    const body = checklist.body as ChecklistBody;
    expect(body.items.map((item) => item.status)).toEqual(['VERIFIED', 'EXPIRED']);
    expect(body.complete).toBe(false);
  });

  it('blocks READY_FOR_PICKUP until the customer documents are complete (08-A04 gate)', async () => {
    const customer = await createCustomer(agencyId, 'DZ');
    const booking = await createBooking({
      customerId: customer.id,
      status: 'CONFIRMED',
      assignedVehicleId: vehicleId,
    });

    const blocked = await errorOf(
      postAs(await agencyToken('doc-admin', agencyId), `/api/v1/agencies/${agencyId}/bookings/${booking.id}/ready`),
    );
    expect(blocked.status).toBe(409);
    expect(blocked.code).toBe('BOOKING_DOCUMENTS_INCOMPLETE');

    // The booking must not have moved.
    const stillConfirmed = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(stillConfirmed?.status).toBe('CONFIRMED');

    await addDocument(customer.id, 'DRIVER_LICENSE', 'VERIFIED', new Date('2030-01-01T00:00:00Z'));

    const ready = await postAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/bookings/${booking.id}/ready`,
    ).expect(201);
    expect((ready.body as ReadyBody).status).toBe('READY_FOR_PICKUP');
    expect((ready.body as ReadyBody).statusHistory[0]).toMatchObject({
      toStatus: 'READY_FOR_PICKUP',
    });
  });

  it('leaves walk-in bookings without a linked customer exempt at the gate (08-A04)', async () => {
    const booking = await createBooking({
      customerId: null,
      status: 'CONFIRMED',
      assignedVehicleId: vehicleId,
    });
    const ready = await postAs(
      await agencyToken('doc-admin', agencyId),
      `/api/v1/agencies/${agencyId}/bookings/${booking.id}/ready`,
    ).expect(201);
    expect((ready.body as ReadyBody).status).toBe('READY_FOR_PICKUP');
  });

  it('404s the checklist for a booking of another agency', async () => {
    const booking = await createBooking({ customerId: null });
    const foreign = await errorOf(
      getAs(
        await agencyToken('doc-other-admin', otherAgencyId),
        `/api/v1/agencies/${otherAgencyId}/bookings/${booking.id}/documents`,
      ),
    );
    expect(foreign.status).toBe(404);
    expect(foreign.code).toBe('BOOKING_NOT_FOUND');
  });
});
