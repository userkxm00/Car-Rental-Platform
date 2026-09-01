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
 * PHASE-07 / 07-A customer identity & profile integration tests: the
 * tenant-scoped customer master (07-A01), platform-account linkage
 * (07-A02), self-service profile settings (07-A03), document requirements
 * state (07-A04) and the marketplace signals favorites/recently
 * viewed/search history (07-A05…A07) — over real HTTP + PostgreSQL with
 * role-based permissions and cross-tenant isolation.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4150;

interface CustomerBody {
  id?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  email?: string | null;
  preferredLocale?: string;
  dateOfBirth?: string | null;
  licenseNumber?: string | null;
  licenseCountry?: string | null;
  licenseIssueDate?: string | null;
  licenseExpiryDate?: string | null;
  status?: string;
  userId?: string | null;
}

interface DocumentBody {
  id?: string;
  type?: string;
  number?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  status?: string;
}

describe('Customer identity/profile (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let agencyId: string;
  let otherAgencyId: string;

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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'cst-' } } });
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
    roles: Array<'AGENCY_OWNER_ADMIN' | 'BRANCH_MANAGER' | 'STAFF_AGENT' | 'FINANCE'> = [
      'AGENCY_OWNER_ADMIN',
    ],
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
    const slug = `cst-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Cst ${slug}`, slug });
    agencyId = tenant.id;
  }

  async function createVehicle(): Promise<string> {
    const category = await prisma.vehicleCategory.create({
      data: { tenantId: agencyId, code: 'ECO', name: 'Economy' },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId: category.id,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `C${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
      },
    });
    return vehicle.id;
  }

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  const validCustomer = {
    firstName: 'Amina',
    lastName: 'Bouzid',
    phone: '+213 555 12 34 56',
    email: 'amina.customer@example.com',
    preferredLocale: 'ar',
    dateOfBirth: '1990-05-12',
    licenseNumber: '123456789',
    licenseCountry: 'DZ',
    licenseIssueDate: '2020-01-10',
    licenseExpiryDate: '2030-01-10',
  };

  beforeAll(async () => {
    await createTenant();
    const otherSlug = `cst-other-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    otherAgencyId = (await tenants.create({ name: `Cst Other ${otherSlug}`, slug: otherSlug })).id;
  });

  describe('agency-side customer master (07-A01/07-A03)', () => {
    let customerId: string;
    let ownerToken: string;
    let staffToken: string;
    let financeToken: string;

    beforeAll(async () => {
      ownerToken = await agencyToken('cst-owner', ['AGENCY_OWNER_ADMIN']);
      staffToken = await agencyToken('cst-staff', ['STAFF_AGENT']);
      financeToken = await agencyToken('cst-finance', ['FINANCE']);
    });

    it('rejects unauthenticated access', async () => {
      const res = await api(app).get(`/api/v1/agencies/${agencyId}/customers`).expect(401);
      expect((res.body as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
    });

    it('lets staff create customers but finance only read', async () => {
      const financeAttempt = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers`)
          .set('Authorization', `Bearer ${financeToken}`)
          .send({ firstName: 'Nope', lastName: 'Nope' }),
      );
      expect(financeAttempt.status).toBe(403);
      expect(financeAttempt.code).toBe('FORBIDDEN');

      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send(validCustomer)
        .expect(201);
      const body = res.body as CustomerBody;
      expect(body.firstName).toBe('Amina');
      expect(body.preferredLocale).toBe('ar');
      expect(body.status).toBe('ACTIVE');
      expect(body.userId).toBeNull();
      customerId = body.id as string;

      const read = await api(app)
        .get(`/api/v1/agencies/${agencyId}/customers/${customerId}`)
        .set('Authorization', `Bearer ${financeToken}`)
        .expect(200);
      expect((read.body as CustomerBody).id).toBe(customerId);
    });

    it('rejects invalid customer fields with stable codes', async () => {
      const badEmail = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ firstName: 'Karim', lastName: 'H', email: 'not-an-email' }),
      );
      expect(badEmail.code).toBe('CUSTOMER_EMAIL_INVALID');

      const badLicense = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            firstName: 'Karim',
            lastName: 'H',
            licenseIssueDate: '2032-01-01',
            licenseExpiryDate: '2030-01-01',
          }),
      );
      expect(badLicense.code).toBe('CUSTOMER_LICENSE_INVALID');
    });

    it('lists with search, status and pagination', async () => {
      await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ firstName: 'Yacine', lastName: 'Merbah' })
        .expect(201);

      const res = await api(app)
        .get(`/api/v1/agencies/${agencyId}/customers`)
        .query({ search: 'bouzid', limit: 10 })
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const body = res.body as { items: CustomerBody[]; total: number };
      expect(body.total).toBe(1);
      expect(body.items[0].lastName).toBe('Bouzid');

      const badLimit = await errorOf(
        api(app)
          .get(`/api/v1/agencies/${agencyId}/customers`)
          .query({ limit: 999 })
          .set('Authorization', `Bearer ${ownerToken}`),
      );
      expect(badLimit.code).toBe('CUSTOMER_LIST_QUERY_INVALID');
    });

    it('isolates records between tenants', async () => {
      // A member of agency A can never read agency B's customer records —
      // the verified membership scope fails the request outright.
      const foreign = await errorOf(
        api(app)
          .get(`/api/v1/agencies/${otherAgencyId}/customers`)
          .set('Authorization', `Bearer ${ownerToken}`),
      );
      expect(foreign.status).toBe(403);
      expect(foreign.code).toBe('FORBIDDEN');

      const foreignOwner = await errorOf(
        api(app)
          .get(`/api/v1/agencies/${agencyId}/customers`)
          .set(
            'Authorization',
            `Bearer ${await agencyToken('cst-other-owner', ['AGENCY_OWNER_ADMIN'], otherAgencyId)}`,
          )
          .query({ search: 'bouzid' }),
      );
      expect(foreignOwner.status).toBe(403);
      expect(foreignOwner.code).toBe('FORBIDDEN');
    });

    it('updates records and rejects malformed patches', async () => {
      const res = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/customers/${customerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ phone: '+213 661 00 00 00' })
        .expect(200);
      expect((res.body as CustomerBody).phone).toBe('+213 661 00 00 00');

      const badLocale = await errorOf(
        api(app)
          .patch(`/api/v1/agencies/${agencyId}/customers/${customerId}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ preferredLocale: 'de' }),
      );
      expect(badLocale.code).toBe('CUSTOMER_LOCALE_INVALID');
    });
  });

  describe('account linkage (07-A02)', () => {
    let customerId: string;
    let ownerToken: string;

    beforeAll(async () => {
      ownerToken = await agencyToken('cst-owner', ['AGENCY_OWNER_ADMIN']);
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ firstName: 'Lina', lastName: 'Saadi', email: 'lina@example.com' })
        .expect(201);
      customerId = (res.body as CustomerBody).id as string;
      await appUserId('cst-market-user');
    });

    it('rejects linking with unknown emails and unlinked unlinks', async () => {
      const unknown = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/link`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ email: 'ghost@kavriqo.test' }),
      );
      expect(unknown.code).toBe('USER_NOT_FOUND');

      const unlinkedUnlink = await errorOf(
        api(app)
          .delete(`/api/v1/agencies/${agencyId}/customers/${customerId}/link`)
          .set('Authorization', `Bearer ${ownerToken}`),
      );
      expect(unlinkedUnlink.code).toBe('CUSTOMER_NOT_LINKED');
    });

    it('links by verified email and enforces the one-link-per-tenant rule', async () => {
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/link`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'cst-market-user@kavriqo.test' })
        .expect(201);
      expect((res.body as CustomerBody).userId).not.toBeNull();

      const alreadyLinked = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/link`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ email: 'cst-market-user@kavriqo.test' }),
      );
      expect(alreadyLinked.code).toBe('CUSTOMER_ALREADY_LINKED');

      // A second record for the same platform account must not link.
      const second = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ firstName: 'Lina', lastName: 'Saadi', email: 'lina2@example.com' })
        .expect(201);
      const taken = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${(second.body as CustomerBody).id}/link`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ email: 'cst-market-user@kavriqo.test' }),
      );
      expect(taken.code).toBe('CUSTOMER_LINK_TAKEN');

      // Staff cannot link accounts (least privilege).
      const staffDenied = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${(second.body as CustomerBody).id}/link`)
          .set('Authorization', `Bearer ${await agencyToken('cst-staff', ['STAFF_AGENT'])}`)
          .send({ email: 'cst-market-user@kavriqo.test' }),
      );
      expect(staffDenied.status).toBe(403);
      expect(staffDenied.code).toBe('FORBIDDEN');

      const unlinked = await api(app)
        .delete(`/api/v1/agencies/${agencyId}/customers/${customerId}/link`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((unlinked.body as CustomerBody).userId).toBeNull();
    });
  });

  describe('documents and requirements state (07-A04)', () => {
    let customerId: string;
    let documentId: string;
    let ownerToken: string;

    beforeAll(async () => {
      ownerToken = await agencyToken('cst-owner', ['AGENCY_OWNER_ADMIN']);
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ firstName: 'Doc', lastName: 'Customer' })
        .expect(201);
      customerId = (res.body as CustomerBody).id as string;
    });

    it('starts with an unsatisfied requirements state', async () => {
      const res = await api(app)
        .get(`/api/v1/agencies/${agencyId}/customers/${customerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const body = res.body as { documentRequirements: { satisfied: boolean } };
      expect(body.documentRequirements.satisfied).toBe(false);
    });

    it('creates one document per type and verifies it', async () => {
      const created = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/documents`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ type: 'DRIVER_LICENSE', number: 'ABC-987', expiryDate: '2030-06-01' })
        .expect(201);
      expect((created.body as DocumentBody).status).toBe('PENDING');
      documentId = (created.body as DocumentBody).id as string;

      const duplicate = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/documents`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ type: 'DRIVER_LICENSE' }),
      );
      expect(duplicate.code).toBe('DOCUMENT_TYPE_EXISTS');

      // Finance cannot verify (customer.read only).
      const financeDenied = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/documents/${documentId}/verify`)
          .set('Authorization', `Bearer ${await agencyToken('cst-finance', ['FINANCE'])}`)
          .send({ decision: 'VERIFIED' }),
      );
      expect(financeDenied.status).toBe(403);
      expect(financeDenied.code).toBe('FORBIDDEN');

      const rejectionMissing = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/documents/${documentId}/verify`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ decision: 'REJECTED' }),
      );
      expect(rejectionMissing.code).toBe('DOCUMENT_REJECTION_REASON_REQUIRED');

      const verified = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/documents/${documentId}/verify`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ decision: 'VERIFIED' })
        .expect(200);
      expect((verified.body as DocumentBody).status).toBe('VERIFIED');

      // Re-verifying a verified document is not a valid transition.
      const reVerify = await errorOf(
        api(app)
          .post(`/api/v1/agencies/${agencyId}/customers/${customerId}/documents/${documentId}/verify`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ decision: 'VERIFIED' }),
      );
      expect(reVerify.code).toBe('DOCUMENT_STATUS_TRANSITION_INVALID');

      const detail = await api(app)
        .get(`/api/v1/agencies/${agencyId}/customers/${customerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((detail.body as { documentRequirements: { satisfied: boolean } }).documentRequirements.satisfied).toBe(true);
    });

    it('resets verification when metadata changes', async () => {
      const updated = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/customers/${customerId}/documents/${documentId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ number: 'ABC-999' })
        .expect(200);
      expect((updated.body as DocumentBody).status).toBe('PENDING');
    });
  });

  describe('marketplace self-service (07-A02…A07)', () => {
    let customerToken: string;
    let strangerToken: string;
    let linkedCustomerId: string;
    let vehicleId: string;

    beforeAll(async () => {
      customerToken = await token('cst-market-user');
      strangerToken = await token('cst-stranger');
      vehicleId = await createVehicle();

      // Link the marketplace user to a fresh record.
      const ownerToken = await agencyToken('cst-owner', ['AGENCY_OWNER_ADMIN']);
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ firstName: 'Self', lastName: 'Service', email: 'self@example.com' })
        .expect(201);
      linkedCustomerId = (res.body as CustomerBody).id as string;
      await api(app)
        .post(`/api/v1/agencies/${agencyId}/customers/${linkedCustomerId}/link`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'cst-market-user@kavriqo.test' })
        .expect(201);
    });

    it('lists only the caller-linked records', async () => {
      const res = await api(app)
        .get('/api/v1/me/customers')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      const body = res.body as Array<{ id: string; agency: { slug: string } }>;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(linkedCustomerId);
      expect(body[0].agency.slug).toMatch(/^cst-/);

      // Another user cannot reach the record.
      const stranger = await errorOf(
        api(app)
          .get(`/api/v1/me/customers/${linkedCustomerId}`)
          .set('Authorization', `Bearer ${strangerToken}`),
      );
      expect(stranger.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('manages own profile settings but not status', async () => {
      const res = await api(app)
        .patch(`/api/v1/me/customers/${linkedCustomerId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ preferredLocale: 'fr', phone: '+213 770 11 22 33' })
        .expect(200);
      expect((res.body as CustomerBody).preferredLocale).toBe('fr');

      const statusDenied = await errorOf(
        api(app)
          .patch(`/api/v1/me/customers/${linkedCustomerId}`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ status: 'SUSPENDED' }),
      );
      expect(statusDenied.code).toBe('CUSTOMER_STATUS_INVALID');
    });

    it('submits and resubmits own documents, never touching verified ones', async () => {
      const created = await api(app)
        .post(`/api/v1/me/customers/${linkedCustomerId}/documents`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ type: 'PASSPORT', number: 'PA-111' })
        .expect(201);
      expect((created.body as DocumentBody).status).toBe('PENDING');

      const edited = await api(app)
        .patch(`/api/v1/me/customers/${linkedCustomerId}/documents/${(created.body as DocumentBody).id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ number: 'PA-222' })
        .expect(200);
      expect((edited.body as DocumentBody).status).toBe('PENDING');

      // The stranger cannot read the documents.
      const stranger = await errorOf(
        api(app)
          .get(`/api/v1/me/customers/${linkedCustomerId}/documents`)
          .set('Authorization', `Bearer ${strangerToken}`),
      );
      expect(stranger.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('manages favorites across agencies (07-A05)', async () => {
      const added = await api(app)
        .put(`/api/v1/me/favorites/${vehicleId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(201);
      expect((added.body as { vehicle: { make: string } }).vehicle.make).toBe('Dacia');

      const duplicate = await errorOf(
        api(app)
          .put(`/api/v1/me/favorites/${vehicleId}`)
          .set('Authorization', `Bearer ${customerToken}`),
      );
      expect(duplicate.code).toBe('FAVORITE_EXISTS');

      const unknownVehicle = await errorOf(
        api(app)
          .put('/api/v1/me/favorites/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${customerToken}`),
      );
      expect(unknownVehicle.code).toBe('VEHICLE_NOT_FOUND');

      const list = await api(app)
        .get('/api/v1/me/favorites')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect((list.body as unknown[]).length).toBe(1);

      await api(app)
        .delete(`/api/v1/me/favorites/${vehicleId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const gone = await errorOf(
        api(app)
          .delete(`/api/v1/me/favorites/${vehicleId}`)
          .set('Authorization', `Bearer ${customerToken}`),
      );
      expect(gone.code).toBe('FAVORITE_NOT_FOUND');
    });

    it('records and clears recently viewed vehicles (07-A06)', async () => {
      await api(app)
        .post('/api/v1/me/recently-viewed')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ vehicleId })
        .expect(201);

      const list = await api(app)
        .get('/api/v1/me/recently-viewed')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect((list.body as unknown[]).length).toBe(1);

      await api(app)
        .delete('/api/v1/me/recently-viewed')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const empty = await api(app)
        .get('/api/v1/me/recently-viewed')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect((empty.body as unknown[]).length).toBe(0);
    });

    it('records, lists and clears search history (07-A07)', async () => {
      const invalid = await errorOf(
        api(app)
          .post('/api/v1/me/search-history')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ criteria: 'Oran' }),
      );
      expect(invalid.code).toBe('SEARCH_CRITERIA_INVALID');

      await api(app)
        .post('/api/v1/me/search-history')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ criteria: { pickupCity: 'Oran', start: '2026-09-10', end: '2026-09-12' } })
        .expect(201);

      const list = await api(app)
        .get('/api/v1/me/search-history')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect((list.body as unknown[]).length).toBe(1);

      await api(app)
        .delete('/api/v1/me/search-history')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const empty = await api(app)
        .get('/api/v1/me/search-history')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect((empty.body as unknown[]).length).toBe(0);
    });
  });
});
