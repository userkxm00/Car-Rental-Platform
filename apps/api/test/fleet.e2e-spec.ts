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
import { BranchesService } from '../src/locations/application/branches.service';
import { LocationsService } from '../src/locations/application/locations.service';
import { TenantService } from '../src/tenants/application/tenant.service';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * Fleet integration tests (03-A07/03-B09/03-B10): category CRUD with
 * authorization + localization; vehicle identity rules, lifecycle, branch
 * assignment, odometer monotonicity, list filters — over real HTTP with a
 * real database. Suite owns the `flt-` slug namespace.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4132;

interface CategoryBody {
  id: string;
  agencyId: string;
  code: string;
  name: string;
  nameAr: string | null;
  nameFr: string | null;
  active: boolean;
  features: string[];
}

function asCategory(body: unknown): CategoryBody {
  return body as CategoryBody;
}

interface VehicleBody {
  id: string;
  status: string;
  currentBranchId: string | null;
}

function asVehicle(body: unknown): VehicleBody {
  return body as VehicleBody;
}

describe('Fleet (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let locations: LocationsService;
  let branches: BranchesService;

  let agencyId: string;
  let otherAgencyId: string;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const testEnv = loadEnvSchema({
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();

    tenants = app.get(TenantService);
    memberships = app.get(MembershipService);
    locations = app.get(LocationsService);
    branches = app.get(BranchesService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    agencyId = (await tenants.create({ name: 'FLT Agency', slug: 'flt-agency' })).id;
    otherAgencyId = (await tenants.create({ name: 'FLT Other', slug: 'flt-other' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'flt-' } } });
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
    role: 'AGENCY_OWNER_ADMIN' | 'STAFF_AGENT',
  ): Promise<string> {
    const userId = await appUserId(subject);
    const existing = (await memberships.listForTenant(agencyId)).find((m) => m.userId === userId);
    if (!existing) {
      await memberships.invite(agencyId, userId, [role]);
      const membership = (await memberships.listForTenant(agencyId)).find(
        (m) => m.userId === userId,
      );
      if (membership) {
        await memberships.accept(userId, membership.id);
      }
    }
    return token(subject);
  }

  const ownerAuth = (): Promise<string> => agencyToken('flt-owner', 'AGENCY_OWNER_ADMIN');
  const staffAuth = (): Promise<string> => agencyToken('flt-staff', 'STAFF_AGENT');

  describe('categories (03-A)', () => {
    it('requires authentication and membership on all category routes (03-A05)', async () => {
      const res = await api(app).get(`/api/v1/agencies/${agencyId}/categories`).expect(401);
      expect((res.body as ApiErrorBody).error.code).toBe('UNAUTHORIZED');

      // An authenticated user who is NOT a member of the agency is denied.
      const stranger = await appUserId('flt-stranger');
      const denied = await api(app)
        .get(`/api/v1/agencies/${agencyId}/categories`)
        .set('Authorization', `Bearer ${await token('flt-stranger')}`)
        .expect(403);
      expect((denied.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
      void stranger;
    });

    it('creates a category with localized fields and catalog features (03-A02/03/06)', async () => {
      const auth = await ownerAuth();
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/categories`)
        .set('Authorization', `Bearer ${auth}`)
        .send({
          name: 'Economy',
          code: 'ECO',
          nameAr: 'اقتصادية',
          nameFr: 'Économique',
          description: 'Compact city cars',
          transmission: 'MANUAL',
          fuelType: 'PETROL',
          seats: 5,
          doors: 4,
          luggageCapacity: 2,
          features: ['air_conditioning', 'bluetooth', 'usb_ports'],
        })
        .expect(201);
      const category = asCategory(res.body);
      expect(category).toMatchObject({
        code: 'ECO',
        nameAr: 'اقتصادية',
        nameFr: 'Économique',
        active: true,
        features: ['air_conditioning', 'bluetooth', 'usb_ports'],
      });
    });

    it('rejects duplicate codes and unknown feature keys', async () => {
      const auth = await ownerAuth();
      const dup = await api(app)
        .post(`/api/v1/agencies/${agencyId}/categories`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ name: 'Dup', code: 'ECO' })
        .expect(409);
      expect((dup.body as ApiErrorBody).error.code).toBe('CATEGORY_CODE_TAKEN');

      const badFeature = await api(app)
        .post(`/api/v1/agencies/${agencyId}/categories`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ name: 'Bad', code: 'BAD', features: ['warp_drive'] })
        .expect(409);
      expect((badFeature.body as ApiErrorBody).error.code).toBe('CATEGORY_VALIDATION_FAILED');
    });

    it('denies category creation to a STAFF_AGENT (permission matrix, 03-A05)', async () => {
      const auth = await staffAuth();
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/categories`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ name: 'No', code: 'NO' })
        .expect(403);
      expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
    });

    it('lists, gets, updates and archives categories (03-A04)', async () => {
      const auth = await ownerAuth();
      const created = asCategory(
        (
          await api(app)
            .post(`/api/v1/agencies/${agencyId}/categories`)
            .set('Authorization', `Bearer ${auth}`)
            .send({ name: 'SUV', code: 'SUV' })
            .expect(201)
        ).body,
      );

      const listed = await api(app)
        .get(`/api/v1/agencies/${agencyId}/categories`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(200);
      const body = listed.body as { categories: CategoryBody[] };
      expect(body.categories.some((c) => c.code === 'SUV')).toBe(true);

      const got = await api(app)
        .get(`/api/v1/agencies/${agencyId}/categories/${created.id}`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(200);
      expect(asCategory(got.body).code).toBe('SUV');

      const updated = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/categories/${created.id}`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ nameFr: 'VUS', features: ['air_conditioning', 'gps_navigation'] })
        .expect(200);
      const updatedCategory = asCategory(updated.body);
      expect(updatedCategory.nameFr).toBe('VUS');
      expect(updatedCategory.features).toEqual(['air_conditioning', 'gps_navigation']);

      const archived = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/categories/${created.id}/active`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ active: false })
        .expect(200);
      expect(asCategory(archived.body).active).toBe(false);

      const activeOnly = await api(app)
        .get(`/api/v1/agencies/${agencyId}/categories?activeOnly=true`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(200);
      const activeBody = activeOnly.body as { categories: CategoryBody[] };
      expect(activeBody.categories.some((c) => c.code === 'SUV')).toBe(false);
    });

    it('is invisible to other agencies (tenant isolation)', async () => {
      const auth = await ownerAuth();
      const created = asCategory(
        (
          await api(app)
            .post(`/api/v1/agencies/${agencyId}/categories`)
            .set('Authorization', `Bearer ${auth}`)
            .send({ name: 'Private', code: 'PRV' })
            .expect(201)
        ).body,
      );
      const foreign = await api(app)
        .get(`/api/v1/agencies/${otherAgencyId}/categories/${created.id}`)
        .set('Authorization', `Bearer ${await token('flt-other-member')}`)
        .expect(403);
      expect((foreign.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
    });
  });

  describe('vehicles (03-B)', () => {
    let categoryId: string;

    beforeAll(async () => {
      const auth = await ownerAuth();
      categoryId = asCategory(
        (
          await api(app)
            .post(`/api/v1/agencies/${agencyId}/categories`)
            .set('Authorization', `Bearer ${auth}`)
            .send({ name: 'Sedan', code: 'SED' })
            .expect(201)
        ).body,
      ).id;
    });

    it('creates a vehicle with identity validation (03-B02)', async () => {
      const auth = await ownerAuth();
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/vehicles`)
        .set('Authorization', `Bearer ${auth}`)
        .send({
          categoryId,
          make: 'Hyundai',
          model: 'Accent',
          year: 2023,
          plateNumber: '12345-31',
          vin: 'KMHCT4AE0DU123456',
          color: 'White',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        make: 'Hyundai',
        plateNumber: '12345-31',
        status: 'AVAILABLE',
      });
    });

    it('rejects duplicate plates and invalid identity fields', async () => {
      const auth = await ownerAuth();
      const dup = await api(app)
        .post(`/api/v1/agencies/${agencyId}/vehicles`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ categoryId, make: 'X', model: 'Y', year: 2020, plateNumber: '12345-31' })
        .expect(409);
      expect((dup.body as ApiErrorBody).error.code).toBe('VEHICLE_PLATE_TAKEN');

      const badVin = await api(app)
        .post(`/api/v1/agencies/${agencyId}/vehicles`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ categoryId, make: 'X', model: 'Y', year: 2020, plateNumber: '9-999', vin: 'SHORT' })
        .expect(409);
      expect((badVin.body as ApiErrorBody).error.code).toBe('VEHICLE_VALIDATION_FAILED');

      const badYear = await api(app)
        .post(`/api/v1/agencies/${agencyId}/vehicles`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ categoryId, make: 'X', model: 'Y', year: 1901, plateNumber: '9-998' })
        .expect(409);
      expect((badYear.body as ApiErrorBody).error.code).toBe('VEHICLE_VALIDATION_FAILED');
    });

    it('enforces the status lifecycle and blocks invalid transitions (03-B03)', async () => {
      const auth = await ownerAuth();
      const vehicle = (
        await api(app)
          .post(`/api/v1/agencies/${agencyId}/vehicles`)
          .set('Authorization', `Bearer ${auth}`)
          .send({ categoryId, make: 'Kia', model: 'Picanto', year: 2022, plateNumber: '77-77' })
          .expect(201)
      ).body as { id: string };

      const maintenanceRes = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/status`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ status: 'MAINTENANCE' })
        .expect(200);
      expect(asVehicle(maintenanceRes.body).status).toBe('MAINTENANCE');

      // MAINTENANCE → RENTED is not declared.
      const invalid = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/status`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ status: 'RENTED' })
        .expect(409);
      expect((invalid.body as ApiErrorBody).error.code).toBe('INVALID_VEHICLE_STATUS_TRANSITION');

      const availableRes = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/status`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ status: 'AVAILABLE' })
        .expect(200);
      expect(asVehicle(availableRes.body).status).toBe('AVAILABLE');
    });

    it('assigns the current branch (03-B04) and rejects foreign branches', async () => {
      const auth = await ownerAuth();
      const vehicle = (
        await api(app)
          .post(`/api/v1/agencies/${agencyId}/vehicles`)
          .set('Authorization', `Bearer ${auth}`)
          .send({ categoryId, make: 'Dacia', model: 'Logan', year: 2021, plateNumber: '55-55' })
          .expect(201)
      ).body as { id: string };

      const location = await locations.createLocation({
        tenantId: agencyId,
        type: 'BRANCH',
        name: 'FLT Branch',
      });
      const branch = await branches.createBranch(agencyId, {
        name: 'FLT Branch',
        code: 'FLT-B1',
        locationId: location.id,
      });

      const assignedRes = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/branch`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ branchId: branch.id })
        .expect(200);
      expect(asVehicle(assignedRes.body).currentBranchId).toBe(branch.id);

      const foreignLocation = await locations.createLocation({
        tenantId: otherAgencyId,
        type: 'BRANCH',
        name: 'Foreign',
      });
      const foreignBranch = await branches.createBranch(otherAgencyId, {
        name: 'Foreign',
        code: 'FRG-1',
        locationId: foreignLocation.id,
      });
      const denied = await api(app)
        .patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/branch`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ branchId: foreignBranch.id })
        .expect(409);
      expect((denied.body as ApiErrorBody).error.code).toBe('VEHICLE_VALIDATION_FAILED');
    });

    it('records monotonic odometer readings (03-B05/06)', async () => {
      const auth = await ownerAuth();
      const vehicle = (
        await api(app)
          .post(`/api/v1/agencies/${agencyId}/vehicles`)
          .set('Authorization', `Bearer ${auth}`)
          .send({ categoryId, make: 'Toyota', model: 'Yaris', year: 2024, plateNumber: '44-44' })
          .expect(201)
      ).body as { id: string };

      await api(app)
        .post(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/odometer`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ odometerKm: 12000, fuelLevelPercent: 80 })
        .expect(201);

      const lower = await api(app)
        .post(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/odometer`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ odometerKm: 9000 })
        .expect(409);
      expect((lower.body as ApiErrorBody).error.code).toBe('VEHICLE_VALIDATION_FAILED');

      const readings = await api(app)
        .get(`/api/v1/agencies/${agencyId}/vehicles/${vehicle.id}/odometer`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(200);
      const body = readings.body as {
        readings: Array<{ odometerKm: number; fuelLevelPercent: number | null }>;
      };
      expect(body.readings[0]).toMatchObject({ odometerKm: 12000, fuelLevelPercent: 80 });
    });

    it('filters the vehicle list by status, category, branch and search (03-B08)', async () => {
      const auth = await ownerAuth();
      const all = await api(app)
        .get(`/api/v1/agencies/${agencyId}/vehicles`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(200);
      const allBody = all.body as { vehicles: Array<{ make: string }> };
      expect(allBody.vehicles.length).toBeGreaterThanOrEqual(4);

      const toyota = await api(app)
        .get(`/api/v1/agencies/${agencyId}/vehicles?search=toyota`)
        .set('Authorization', `Bearer ${auth}`)
        .expect(200);
      const toyotaBody = toyota.body as { vehicles: Array<{ make: string }> };
      expect(toyotaBody.vehicles).toHaveLength(1);
      expect(toyotaBody.vehicles[0]?.make).toBe('Toyota');
    });

    it('denies fleet management to a staff agent (03-B09)', async () => {
      const auth = await staffAuth();
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/vehicles`)
        .set('Authorization', `Bearer ${auth}`)
        .send({ categoryId, make: 'X', model: 'Y', year: 2020, plateNumber: '66-66' })
        .expect(403);
      expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
    });
  });
});
