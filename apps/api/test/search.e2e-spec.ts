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
 * PHASE-07 / 07-B marketplace search integration: public cross-agency
 * offers with marketplace gating (07-B07), location-constrained pickup
 * points (07-B02), interval eligibility through each agency's availability
 * engine (07-B03/B08), server-computed pricing (07-B05), attribute
 * filters (07-B04/B06), deterministic ordering and pagination (07-B10)
 * and the empty-result contract (07-B11).
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4161;

const START = '2026-11-02T09:00:00.000Z'; // Monday
const END = '2026-11-04T09:00:00.000Z'; // Wednesday

interface OfferBody {
  agency: { id: string; slug: string };
  vehicle: { id: string; category: { transmission: string | null; fuelType: string | null; seats: number | null; features: string[] } };
  pickupBranch: { id: string; location: { city: string } } | null;
  pricing: { totalMinor: number };
}

interface SearchBody {
  items: OfferBody[];
  total: number;
  page: number;
  limit: number;
  sort: string;
  filters: Record<string, unknown>;
}

describe('Marketplace search (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let agencyId: string;
  let otherAgencyId: string;
  let locationOran: string;
  let locationAlgiers: string;

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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'srh-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  async function createTenant(slugPrefix: string, marketplace = true): Promise<string> {
    const slug = `srh-${slugPrefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Search ${slug}`, slug });
    if (marketplace) {
      await tenants.setMarketplaceEnabled(tenant.id, true);
    }
    return tenant.id;
  }

  async function createLocation(city: string): Promise<string> {
    const location = await prisma.location.create({
      data: { name: `${city} Downtown`, city, countryCode: 'DZ', latitude: city === 'Oran' ? 35.7 : 36.75, longitude: city === 'Oran' ? -0.63 : 3.06 },
    });
    return location.id;
  }

  async function createBranch(tenantId: string, locationId: string): Promise<string> {
    const branch = await prisma.branch.create({
      data: { tenantId, name: `Branch ${locationId.slice(0, 4)}`, code: `B${Date.now() % 100000}${Math.floor(Math.random() * 100)}`, locationId },
    });
    return branch.id;
  }

  async function createVehicle(
    tenantId: string,
    categoryCode: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const category = await prisma.vehicleCategory.create({
      data: {
        tenantId,
        code: categoryCode,
        name: categoryCode,
        transmission: overrides.transmission as string | undefined,
        fuelType: overrides.fuelType as string | undefined,
        seats: overrides.seats as number | undefined,
        features: {
          create: ((overrides.features as string[] | undefined) ?? []).map((featureKey) => ({ featureKey })),
        },
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId,
        categoryId: category.id,
        currentBranchId: overrides.currentBranchId as string | undefined,
        make: overrides.make as string ?? 'Dacia',
        model: overrides.model as string ?? 'Logan',
        year: 2024,
        plateNumber: `S${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
      },
    });
    return vehicle.id;
  }

  async function createPlan(tenantId: string, baseRateMinor: number): Promise<void> {
    await prisma.ratePlan.create({
      data: {
        tenantId,
        code: `BASE-${baseRateMinor}-${Date.now()}`,
        name: 'Base',
        currency: 'DZD',
        durationUnit: 'DAILY',
        baseRateMinor,
        precedence: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        active: true,
      },
    });
  }

  const search = (query: Record<string, string>) =>
    api(app).get('/api/v1/search/offers').query(query);

  beforeAll(async () => {
    agencyId = await createTenant('a');
    otherAgencyId = await createTenant('b');
    locationOran = await createLocation('Oran');
    locationAlgiers = await createLocation('Algiers');
  });

  it('is public and rejects malformed queries with stable codes', async () => {
    const malformed = await errorOf(search({}));
    expect(malformed.status).toBe(409);
    expect(malformed.code).toBe('INVALID_INTERVAL');

    const inPast = await errorOf(search({ start: '2020-01-01T09:00:00.000Z', end: END }));
    expect(inPast.code).toBe('INTERVAL_IN_PAST');

    const badLimit = await errorOf(search({ start: START, end: END, limit: '999' }));
    expect(badLimit.code).toBe('INVALID_LIMIT');

    const badSort = await errorOf(search({ start: START, end: END, sort: 'distance_asc' }));
    expect(badSort.code).toBe('DISTANCE_REQUIRES_COORDINATES');
  });

  it('returns empty results with echoed filters before any agency opts in (07-B11)', async () => {
    const res = await search({ start: START, end: END }).expect(200);
    const body = res.body as SearchBody;
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.sort).toBe('price_asc');
    expect(body.filters).toMatchObject({ pickupCity: null, features: [] });
  });

  it('offers priced, available vehicles of participating agencies only (07-B07/B08)', async () => {
    const branchA = await createBranch(agencyId, locationOran);
    const branchB = await createBranch(otherAgencyId, locationOran);
    await createVehicle(agencyId, 'ECO', { currentBranchId: branchA });
    await createVehicle(otherAgencyId, 'ECO', { currentBranchId: branchB });
    // Third vehicle: same agency but not enabled... covered by disabled agency.
    await createPlan(agencyId, 4500);
    await createPlan(otherAgencyId, 4800);
    // The other agency opts out.
    await tenants.setMarketplaceEnabled(otherAgencyId, false);

    const res = await search({ start: START, end: END }).expect(200);
    const body = res.body as SearchBody;
    expect(body.total).toBe(1);
    expect(body.items[0].agency.id).toBe(agencyId);
    expect(body.items[0].pricing.totalMinor).toBe(9000); // 2 days × 4500

    await tenants.setMarketplaceEnabled(otherAgencyId, true);
    const both = (await search({ start: START, end: END }).expect(200)).body as SearchBody;
    expect(both.total).toBe(2);
    const totals = both.items.map((item) => item.pricing.totalMinor).sort((a, b) => a - b);
    expect(totals).toEqual([9000, 9600]);
  });

  it('excludes vehicles that are not actually bookable (blocked or unpriced)', async () => {
    const branchA = await prisma.branch.findFirst({ where: { tenantId: agencyId } });
    const blocked = await createVehicle(agencyId, 'BLOCKED', { currentBranchId: branchA?.id });
    await prisma.vehicleBlock.create({
      data: {
        tenantId: agencyId,
        vehicleId: blocked,
        blockType: 'MAINTENANCE',
        startsAt: new Date(START),
        endsAt: new Date(END),
      },
    });
    // An agency with vehicles but no rate plan contributes no offers:
    // unpriced vehicles are never bookable-as-priced.
    const noPlanAgency = await createTenant('noplan');
    const branchN = await createBranch(noPlanAgency, locationOran);
    await createVehicle(noPlanAgency, 'NOPLAN', { currentBranchId: branchN });

    const res = await search({ start: START, end: END }).expect(200);
    const body = res.body as SearchBody;
    const ids = body.items.map((item) => item.vehicle.id);
    expect(ids).not.toContain(blocked);
    // The no-plan agency contributes nothing.
    expect(body.items.every((item) => item.agency.id !== noPlanAgency)).toBe(true);
  });

  it('filters by pickup location id and city (07-B02)', async () => {
    const branchAlgiers = await createBranch(agencyId, locationAlgiers);
    await createVehicle(agencyId, 'ALG', { currentBranchId: branchAlgiers });

    const byLocation = (await search({ start: START, end: END, pickupLocationId: locationOran }).expect(200)).body as SearchBody;
    expect(byLocation.total).toBeGreaterThan(0);
    for (const item of byLocation.items) {
      expect(item.pickupBranch?.location.city).toBe('Oran');
    }

    const byCity = (await search({ start: START, end: END, pickupCity: 'algiers' }).expect(200)).body as SearchBody;
    expect(byCity.total).toBeGreaterThan(0);
    for (const item of byCity.items) {
      expect(item.pickupBranch?.location.city).toBe('Algiers');
    }
  });

  it('applies category attribute and price filters (07-B04/B05/B06)', async () => {
    const branchA = await prisma.branch.findFirst({ where: { tenantId: agencyId } });
    await createVehicle(agencyId, 'AUTO', {
      currentBranchId: branchA?.id,
      transmission: 'AUTOMATIC',
      fuelType: 'DIESEL',
      seats: 5,
      features: ['bluetooth', 'gps_navigation'],
    });

    const res = await search({
      start: START,
      end: END,
      transmission: 'AUTOMATIC',
      fuelType: 'DIESEL',
      seats: '5',
      features: 'bluetooth',
    }).expect(200);
    const body = res.body as SearchBody;
    expect(body.total).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.vehicle.category.transmission).toBe('AUTOMATIC');
      expect(item.vehicle.category.fuelType).toBe('DIESEL');
      expect(item.vehicle.category.seats).toBe(5);
      expect(item.vehicle.category.features).toContain('bluetooth');
    }

    const priceRes = await search({ start: START, end: END, priceMinMinor: '9000', priceMaxMinor: '9000' }).expect(200);
    const priceBody = priceRes.body as SearchBody;
    expect(priceBody.total).toBeGreaterThan(0);
    for (const item of priceBody.items) {
      expect(item.pricing.totalMinor).toBe(9000);
    }

    const nothing = await search({ start: START, end: END, priceMaxMinor: '1' }).expect(200);
    expect(((nothing.body as SearchBody).total)).toBe(0);
  });

  it('sorts deterministically and paginates (07-B10)', async () => {
    const res = await search({ start: START, end: END, sort: 'price_asc', limit: '2', page: '1' }).expect(200);
    const body = res.body as SearchBody;
    expect(body.limit).toBe(2);
    expect(body.page).toBe(1);
    const totals = body.items.map((item) => item.pricing.totalMinor);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);

    const byDistance = await search({
      start: START,
      end: END,
      sort: 'distance_asc',
      lat: '35.7',
      lng: '-0.63',
    }).expect(200);
    const distances = (byDistance.body as SearchBody).items.map((item) => item.pickupBranch?.location.city ?? '');
    expect(distances.length).toBeGreaterThan(0);
  });

  it('filters by radius and viewport proximity (07-C09)', async () => {
    const oranRadius = await search({ start: START, end: END, lat: '35.7', lng: '-0.63', radiusKm: '10' }).expect(200);
    const oranBody = oranRadius.body as SearchBody;
    expect(oranBody.total).toBeGreaterThan(0);
    for (const item of oranBody.items) {
      expect(item.pickupBranch?.location.city).toBe('Oran');
    }
    expect(oranBody.filters.radiusKm).toBe(10);

    const oranBbox = await search({ start: START, end: END, bbox: '-5,34,1,37' }).expect(200);
    const oranBboxBody = oranBbox.body as SearchBody;
    expect(oranBboxBody.total).toBe(oranBody.total);
    expect(oranBboxBody.filters.bbox).toEqual({ west: -5, south: 34, east: 1, north: 37 });

    const algiersBbox = await search({ start: START, end: END, bbox: '2,36,4,37' }).expect(200);
    for (const item of (algiersBbox.body as SearchBody).items) {
      expect(item.pickupBranch?.location.city).toBe('Algiers');
    }

    const radiusWithoutCoords = await errorOf(search({ start: START, end: END, radiusKm: '10' }));
    expect(radiusWithoutCoords.status).toBe(409);
    expect(radiusWithoutCoords.code).toBe('RADIUS_REQUIRES_COORDINATES');

    const malformedBbox = await errorOf(search({ start: START, end: END, bbox: '1,2,3' }));
    expect(malformedBbox.status).toBe(409);
    expect(malformedBbox.code).toBe('INVALID_BBOX');
  });

  it('serves the public locations feed for map pins (07-C05/07-C06)', async () => {
    interface LocationsBody {
      items: Array<{
        branch: { id: string };
        location: { id: string; name: string; city: string | null; latitude: number; longitude: number };
        agency: { id: string; slug: string };
      }>;
      total: number;
    }

    // A branch without coordinates must never become a pin.
    const noCoordsLocation = await prisma.location.create({
      data: { name: 'Oran Suburb', city: 'Oran', countryCode: 'DZ', latitude: null, longitude: null },
    });
    await createBranch(agencyId, noCoordsLocation.id);

    const res = await api(app).get('/api/v1/search/locations').expect(200);
    const body = res.body as LocationsBody;
    expect(body.total).toBeGreaterThanOrEqual(3);
    for (const item of body.items) {
      expect(item.location.latitude).not.toBeNull();
      expect(item.location.longitude).not.toBeNull();
    }
    const noCoordsPin = body.items.find((item) => item.location.id === noCoordsLocation.id);
    expect(noCoordsPin).toBeUndefined();
    const agencies = new Set(body.items.map((item) => item.agency.id));
    expect(agencies.has(agencyId)).toBe(true);

    // Opting out removes an agency's pins.
    await tenants.setMarketplaceEnabled(otherAgencyId, false);
    const afterOptOut = (await api(app).get('/api/v1/search/locations').expect(200)).body as LocationsBody;
    expect(afterOptOut.items.every((item) => item.agency.id !== otherAgencyId)).toBe(true);
    await tenants.setMarketplaceEnabled(otherAgencyId, true);
  });
});
