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
import { MediaService } from '../src/media/application/media.service';
import { LocalTempObjectStorage } from '../src/media/infrastructure/local-temp-object-storage';
import { ObjectStorage } from '../src/media/ports/object-storage.port';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import type { Test as SuperTest } from 'supertest';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-07 / 07-D agency public profiles integration: public identity +
 * verification badge (07-D01/D02), branches with opening hours and
 * contacts (07-D03/D04/D06), deposit policies (07-D05), honest NEW rating
 * summary (07-D07), bookable fleet via the offer pipeline (07-D08),
 * vehicle offer detail (07-D09) and signed gallery URLs (07-D10).
 * Non-participating agencies are invisible (404) — the marketplace
 * opt-in boundary.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4162;

const START = '2026-11-02T09:00:00.000Z';
const END = '2026-11-04T09:00:00.000Z';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

interface ProfileBody {
  agency: {
    id: string;
    name: string;
    slug: string;
    verificationStatus: string;
    establishedAt: string;
    defaultCurrency: string;
    defaultLocale: string;
  };
  serviceAreas: string[];
  stats: { branchCount: number; fleetCount: number };
  ratingSummary: { state: string; averageRating: number | null; reviewCount: number };
  depositPolicies: Array<{ name: string; depositType: string; valueMinor: number }>;
}

interface BranchBody {
  id: string;
  name: string;
  code: string;
  contacts: { phone?: string; email?: string };
  location: { id: string; city: string | null; latitude: number | null; longitude: number | null };
  hours: {
    regular: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
    exceptions: Array<{ date: string; opensAt: string | null; closesAt: string | null }>;
  };
}

interface VehicleDetailBody {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    category: { id: string; name: string; nameAr: string | null; features: string[] };
    gallery: Array<{ id: string; position: number; isPrimary: boolean; contentType: string }>;
    pickupBranch: { id: string } | null;
  };
  offer: {
    pickupBranch: { id: string; distanceKm: number | null } | null;
    pricing: { totalMinor: number; currency: string };
  } | null;
}

describe('Agency public profiles (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let agencyId: string;
  let agencySlug: string;
  let otherAgencyId: string;
  let vehicleId: string;
  const createdLocationIds: string[] = [];

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
      .overrideProvider(ObjectStorage)
      .useClass(LocalTempObjectStorage)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    tenants = app.get(TenantService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'prf-' } } });
    if (createdLocationIds.length > 0) {
      await prisma.location.deleteMany({ where: { id: { in: createdLocationIds } } });
    }
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function createAgency(prefix: string, marketplace: boolean): Promise<{ id: string; slug: string }> {
    const slug = `prf-${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Profiles ${slug}`, slug });
    if (marketplace) {
      await tenants.setMarketplaceEnabled(tenant.id, true);
    }
    return { id: tenant.id, slug };
  }

  async function createLocation(city: string, latitude: number, longitude: number): Promise<string> {
    const location = await prisma.location.create({
      data: { name: `${city} Centre`, city, countryCode: 'DZ', latitude, longitude },
    });
    createdLocationIds.push(location.id);
    return location.id;
  }

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  beforeAll(async () => {
    const agency = await createAgency('oran', true);
    agencyId = agency.id;
    agencySlug = agency.slug;
    otherAgencyId = (await createAgency('hidden', false)).id;

    const location = await createLocation('Oran', 35.7041, -0.6401);
    const branch = await prisma.branch.create({
      data: {
        tenantId: agencyId,
        name: 'Oran Centre',
        code: `C${Date.now() % 100000}`,
        locationId: location,
        timezone: 'Africa/Algiers',
        contacts: { phone: '+213550000001', email: 'center@example.dz' },
      },
    });
    await prisma.locationHours.createMany({
      data: [
        { locationId: location, dayOfWeek: 0, opensAt: '08:00', closesAt: '19:00' },
        { locationId: location, dayOfWeek: 5, opensAt: '09:00', closesAt: '13:00' },
      ],
    });
    await prisma.locationHourException.create({
      data: { locationId: location, date: new Date('2026-11-01T00:00:00.000Z'), opensAt: null, closesAt: null },
    });

    const category = await prisma.vehicleCategory.create({
      data: {
        tenantId: agencyId,
        code: 'ECO',
        name: 'Economy',
        nameAr: 'اقتصادية',
        features: { create: [{ featureKey: 'air_conditioning' }, { featureKey: 'bluetooth' }] },
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId: category.id,
        currentBranchId: branch.id,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `V${Date.now() % 1000000}`,
      },
    });
    vehicleId = vehicle.id;

    await prisma.ratePlan.create({
      data: {
        tenantId: agencyId,
        code: `PROF-${Date.now()}`,
        name: 'Base',
        currency: 'DZD',
        durationUnit: 'DAILY',
        baseRateMinor: 4500,
        precedence: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        active: true,
      },
    });
    await prisma.depositPolicy.create({
      data: { tenantId: agencyId, name: 'Standard', depositType: 'FIXED_MINOR', valueMinor: 20000 },
    });

    // A hidden agency's vehicle must never be visible through profiles.
    const hiddenLocation = await createLocation('Tlemcen', 34.8828, -1.3167);
    const hiddenBranch = await prisma.branch.create({
      data: {
        tenantId: otherAgencyId,
        name: 'Tlemcen Centre',
        code: `H${Date.now() % 100000}`,
        locationId: hiddenLocation,
      },
    });
    const hiddenCategory = await prisma.vehicleCategory.create({
      data: { tenantId: otherAgencyId, code: 'STD', name: 'Standard' },
    });
    await prisma.vehicle.create({
      data: {
        tenantId: otherAgencyId,
        categoryId: hiddenCategory.id,
        currentBranchId: hiddenBranch.id,
        make: 'Renault',
        model: 'Clio',
        year: 2022,
        plateNumber: `H${Date.now() % 1000000}`,
      },
    });
  });

  const profile = (slug: string) => api(app).get(`/api/v1/marketplace/agencies/${slug}`);
  const branches = (slug: string) => api(app).get(`/api/v1/marketplace/agencies/${slug}/branches`);
  const fleet = (slug: string, query: Record<string, string>) =>
    api(app).get(`/api/v1/marketplace/agencies/${slug}/vehicles`).query(query);
  const vehicleDetail = (slug: string, vehicleIdParam: string, query: Record<string, string>) =>
    api(app).get(`/api/v1/marketplace/agencies/${slug}/vehicles/${vehicleIdParam}`).query(query);

  it('404s unknown slugs and hides non-participating agencies (07-D01)', async () => {
    expect(await errorOf(profile('prf-missing'))).toEqual({ status: 404, code: 'AGENCY_NOT_FOUND' });
    const hidden = await prisma.tenant.findFirst({ where: { id: otherAgencyId } });
    expect(await errorOf(profile(hidden?.slug ?? 'never'))).toEqual({ status: 404, code: 'AGENCY_NOT_FOUND' });
  });

  it('composes the public profile with badge, stats, areas and policies (07-D02/D05/D07)', async () => {
    const response = await profile(agencySlug).expect(200);
    const body = response.body as ProfileBody;
    expect(body.agency).toMatchObject({
      name: expect.any(String) as string,
      slug: agencySlug,
      verificationStatus: 'UNVERIFIED',
      defaultCurrency: 'DZD',
    });
    expect(body.agency.establishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.serviceAreas).toEqual(['Oran']);
    expect(body.stats.branchCount).toBe(1);
    expect(body.stats.fleetCount).toBe(1);
    expect(body.ratingSummary).toEqual({ state: 'NEW', averageRating: null, reviewCount: 0 });
    expect(body.depositPolicies).toEqual([{ name: 'Standard', depositType: 'FIXED_MINOR', valueMinor: 20000 }]);
  });

  it('lists public branches with hours and contact methods (07-D03/D04/D06)', async () => {
    const response = await branches(agencySlug).expect(200);
    const body = response.body as { items: BranchBody[]; total: number };
    expect(body.total).toBe(1);
    const branch = body.items[0];
    expect(branch).toMatchObject({
      name: 'Oran Centre',
      timezone: 'Africa/Algiers',
      contacts: { phone: '+213550000001', email: 'center@example.dz' },
      location: { city: 'Oran', latitude: 35.7041, longitude: -0.6401 },
    });
    expect(branch.hours.regular).toEqual([
      { dayOfWeek: 0, opensAt: '08:00', closesAt: '19:00' },
      { dayOfWeek: 5, opensAt: '09:00', closesAt: '13:00' },
    ]);
    expect(branch.hours.exceptions).toEqual([{ date: '2026-11-01', opensAt: null, closesAt: null }]);
  });

  it('serves the bookable fleet through the offer pipeline (07-D08)', async () => {
    const response = await fleet(agencySlug, { start: START, end: END }).expect(200);
    const body = response.body as { items: Array<{ vehicle: { id: string }; pricing: { totalMinor: number } }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0].vehicle.id).toBe(vehicleId);
    expect(body.items[0].pricing.totalMinor).toBe(9000);
    // The server forces the tenant scope — a conflicting agencyId is ignored.
    const scoped = (await fleet(agencySlug, { start: START, end: END, agencyId: otherAgencyId })).body as {
      total: number;
    };
    expect(scoped.total).toBe(1);
  });

  it('returns the vehicle offer detail with pricing (07-D09)', async () => {
    const response = await vehicleDetail(agencySlug, vehicleId, { start: START, end: END }).expect(200);
    const body = response.body as VehicleDetailBody;
    expect(body.vehicle).toMatchObject({
      id: vehicleId,
      make: 'Dacia',
      model: 'Logan',
      year: 2024,
      category: { name: 'Economy', nameAr: 'اقتصادية', features: ['air_conditioning', 'bluetooth'] },
      gallery: [],
    });
    expect(body.vehicle.pickupBranch?.id).toBeTruthy();
    expect(body.offer?.pricing).toMatchObject({ totalMinor: 9000, currency: 'DZD' });
    expect(body.offer?.pickupBranch?.distanceKm).toBeNull();
  });

  it('404s unknown vehicles and vehicles of other agencies (07-D09)', async () => {
    expect(await errorOf(vehicleDetail(agencySlug, '00000000-0000-4000-8000-000000000000', { start: START, end: END }))).toEqual({
      status: 404,
      code: 'VEHICLE_NOT_FOUND',
    });
    const hiddenVehicle = await prisma.vehicle.findFirst({ where: { tenantId: otherAgencyId } });
    expect(
      await errorOf(vehicleDetail(agencySlug, hiddenVehicle?.id ?? 'x', { start: START, end: END })),
    ).toEqual({ status: 404, code: 'VEHICLE_NOT_FOUND' });
  });

  it('serves signed gallery URLs for owned images only (07-D10)', async () => {
    const media = app.get(MediaService);
    const image = await media.uploadImage(agencyId, vehicleId, {
      data: PNG_BYTES,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    const response = await api(app)
      .get(`/api/v1/marketplace/agencies/${agencySlug}/vehicles/${vehicleId}/images/${image.id}/url`)
      .expect(200);
    expect((response.body as { url: string; expiresAt: string }).url).toContain('local.test');
    expect((response.body as { expiresAt: string }).expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(
      await errorOf(
        api(app).get(
          `/api/v1/marketplace/agencies/${agencySlug}/vehicles/${vehicleId}/images/00000000-0000-4000-8000-000000000000/url`,
        ),
      ),
    ).toEqual({ status: 404, code: 'IMAGE_NOT_FOUND' });
  });
});
