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
 * Availability API integration tests (04-C07/08): the computed availability
 * answer over real HTTP + real PostgreSQL — blocks, holds (incl. expiry),
 * branch constraints, capacity math, boundary validation, authorization and
 * tenant isolation.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4142;

interface AvailabilityBody {
  vehicleId?: string;
  available?: boolean;
  reasons?: Array<{ code: string; blockType?: string; commitmentId?: string }>;
  constraintsApplied?: string[];
  constraintsPending?: string[];
}

interface ListBody {
  vehicles: Array<{ id: string; make: string; model: string }>;
  total: number;
}

interface CapacityBody {
  eligible: number;
  committed: number;
  available: number;
}

describe('Availability API (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let agencyId: string;

  const START = '2026-09-10T08:00:00Z';
  const END = '2026-09-10T18:00:00Z';

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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'avq-' } } });
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

  async function agencyToken(subject: string): Promise<string> {
    const userId = await appUserId(subject);
    const existing = (await memberships.listForTenant(agencyId)).find((m) => m.userId === userId);
    if (!existing) {
      await memberships.invite(agencyId, userId, ['AGENCY_OWNER_ADMIN']);
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
    const slug = `avq-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Avq ${slug}`, slug });
    agencyId = tenant.id;
  }

  async function createCategory(code: string): Promise<string> {
    const category = await prisma.vehicleCategory.create({
      data: { tenantId: agencyId, code, name: code },
    });
    return category.id;
  }

  async function createVehicle(categoryId: string, make = 'Dacia', plate?: string): Promise<string> {
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId,
        make,
        model: 'Logan',
        year: 2024,
        plateNumber: plate ?? `AQ${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
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

  it('requires authentication and agency membership on availability routes', async () => {
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const url = `/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START}&end=${END}`;

    await api(app).get(url).expect(401);

    const stranger = await appUserId('avq-stranger');
    const res = await api(app)
      .get(url)
      .set('Authorization', `Bearer ${await token('avq-stranger')}`)
      .expect(403);
    expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
    void stranger;
  });

  it('answers available for an uncommitted vehicle (04-C01)', async () => {
    const auth = await agencyToken('avq-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    const res = await api(app)
      .get(`/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START}&end=${END}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);

    const body = res.body as AvailabilityBody;
    expect(body.available).toBe(true);
    expect(body.reasons).toEqual([]);
  });

  it('blocks availability for overlapping maintenance and inspection blocks with reasons (04-C04/05)', async () => {
    const auth = await agencyToken('avq-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    await prisma.vehicleBlock.create({
      data: {
        tenantId: agencyId,
        vehicleId,
        blockType: 'MAINTENANCE',
        startsAt: new Date('2026-09-10T06:00:00Z'),
        endsAt: new Date('2026-09-10T12:00:00Z'),
      },
    });
    await prisma.vehicleBlock.create({
      data: {
        tenantId: agencyId,
        vehicleId,
        blockType: 'INSPECTION',
        startsAt: new Date('2026-09-10T12:00:00Z'),
        endsAt: new Date('2026-09-10T14:00:00Z'),
      },
    });

    const res = await api(app)
      .get(`/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START}&end=${END}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);

    const body = res.body as AvailabilityBody;
    expect(body.available).toBe(false);
    expect(body.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BLOCK_CONFLICT', blockType: 'MAINTENANCE' }),
        expect.objectContaining({ code: 'BLOCK_CONFLICT', blockType: 'INSPECTION' }),
      ]),
    );
  });

  it('treats overlapping ACTIVE holds as conflicting and expired holds as inert (04-B05)', async () => {
    const auth = await agencyToken('avq-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);

    await prisma.bookingHold.create({
      data: {
        tenantId: agencyId,
        vehicleId,
        startsAt: new Date('2026-09-10T09:00:00Z'),
        endsAt: new Date('2026-09-10T11:00:00Z'),
        expiresAt: new Date(Date.now() - 60_000), // already expired (relative to now)
        channel: 'STAFF',
      },
    });
    await prisma.bookingHold.create({
      data: {
        tenantId: agencyId,
        vehicleId,
        startsAt: new Date('2026-09-10T12:00:00Z'),
        endsAt: new Date('2026-09-10T13:00:00Z'),
        expiresAt: new Date('2026-09-11T00:00:00Z'), // live
        channel: 'MARKETPLACE',
      },
    });

    const res = await api(app)
      .get(`/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START}&end=${END}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);

    const body = res.body as AvailabilityBody;
    expect(body.available).toBe(false);
    expect(body.reasons).toHaveLength(1);
    expect(body.reasons?.[0]).toMatchObject({ code: 'HOLD_CONFLICT' });
  });

  it('applies the pickup-branch constraint (04-C03)', async () => {
    const auth = await agencyToken('avq-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const branchA = await prisma.branch.create({
      data: {
        tenantId: agencyId,
        name: 'Branch A',
        code: 'BR-A',
        locationId: (
          await prisma.location.create({
            data: { tenantId: agencyId, name: 'Loc A', type: 'BRANCH' },
          })
        ).id,
      },
    });

    await prisma.vehicle.update({ where: { id: vehicleId }, data: { currentBranchId: branchA.id } });

    const wrongBranch = await api(app)
      .get(
        `/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START}&end=${END}&pickupBranchId=${'00000000-0000-0000-0000-000000000099'}`,
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(404); // unknown branch id is validated at the boundary
    expect((wrongBranch.body as ApiErrorBody).error.code).toBe('BRANCH_NOT_FOUND');

    const rightBranch = await api(app)
      .get(
        `/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START}&end=${END}&pickupBranchId=${branchA.id}`,
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((rightBranch.body as AvailabilityBody).available).toBe(true);
  });

  it('lists only bookable vehicles and computes category capacity (04-C02)', async () => {
    const auth = await agencyToken('avq-owner');
    const categoryId = await createCategory('BASE');
    const free = await createVehicle(categoryId, 'Dacia');
    const blocked = await createVehicle(categoryId, 'Hyundai');

    await prisma.vehicleBlock.create({
      data: {
        tenantId: agencyId,
        vehicleId: blocked,
        blockType: 'DAMAGE',
        startsAt: new Date('2026-09-10T00:00:00Z'),
        endsAt: new Date('2026-09-11T00:00:00Z'),
      },
    });

    const list = await api(app)
      .get(`/api/v1/agencies/${agencyId}/availability/vehicles?start=${START}&end=${END}`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    const listBody = list.body as ListBody;
    expect(listBody.total).toBe(1);
    expect(listBody.vehicles[0]).toMatchObject({ id: free, make: 'Dacia' });

    const capacity = await api(app)
      .get(
        `/api/v1/agencies/${agencyId}/availability/categories/${categoryId}?start=${START}&end=${END}`,
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect(capacity.body as CapacityBody).toMatchObject({ eligible: 2, committed: 1, available: 1 });
  });

  it('rejects invalid intervals at the boundary (04-A05)', async () => {
    const auth = await agencyToken('avq-owner');
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const base = `/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}`;

    for (const query of [
      '', // missing params
      `?start=${START}&end=${START}`, // zero length
      `?start=${END}&end=${START}`, // inverted
      `?start=2026-09-10T08:00:00&end=${END}`, // naive datetime
    ]) {
      const res = await api(app)
        .get(`${base}${query}`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(409);
      expect((res.body as ApiErrorBody).error.code).toBe('INVALID_INTERVAL');
    }
  });

  it('hides other agencies vehicles (tenant isolation) and validates delivery zones', async () => {
    const auth = await agencyToken('avq-owner');
    const otherTenant = await tenants.create({ name: 'Other', slug: `avq-other-${Date.now()}` });
    const otherCategory = await prisma.vehicleCategory.create({
      data: { tenantId: otherTenant.id, code: 'OTHER', name: 'Other' },
    });
    const otherVehicle = await prisma.vehicle.create({
      data: {
        tenantId: otherTenant.id,
        categoryId: otherCategory.id,
        make: 'Other',
        model: 'Car',
        year: 2024,
        plateNumber: `OX${Date.now() % 1000000}`,
      },
    });

    const res = await api(app)
      .get(
        `/api/v1/agencies/${agencyId}/availability/vehicles/${otherVehicle.id}?start=${START}&end=${END}`,
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(404);
    expect((res.body as ApiErrorBody).error.code).toBe('VEHICLE_NOT_FOUND');

    // A delivery zone that belongs to another tenant is not found here.
    await prisma.deliveryZone.create({
      data: { tenantId: otherTenant.id, name: 'Zone X' },
    });
    const zone = await prisma.deliveryZone.findFirstOrThrow({ where: { tenantId: otherTenant.id } });
    const categoryId = await createCategory('BASE');
    const vehicleId = await createVehicle(categoryId);
    const zoneRes = await api(app)
      .get(
        `/api/v1/agencies/${agencyId}/availability/vehicles/${vehicleId}?start=${START}&end=${END}&deliveryZoneId=${zone.id}`,
      )
      .set('Authorization', `Bearer ${auth}`)
      .expect(404);
    expect((zoneRes.body as ApiErrorBody).error.code).toBe('DELIVERY_ZONE_NOT_FOUND');

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
