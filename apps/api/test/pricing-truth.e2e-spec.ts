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
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-06 / 06-D financial-truth integration tests: the engine prices
 * quotes end-to-end (06-D05/06), confirmed bookings snapshot the
 * authoritative calculation (06-D07), snapshots are immutable across
 * config changes and replays (06-D08) and concurrent pricing is
 * reproducible (06-D09).
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4149;

interface QuotePricingBody {
  currency?: string;
  totalMinor?: number;
  depositMinor?: number | null;
  breakdown?: Array<{ code: string; amountMinor: number }>;
  calculatedAt?: string;
}

interface BookingBody {
  bookingId?: string;
  status?: string;
  end?: string;
}

describe('Pricing financial truth (integration, 06-D)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let agencyId: string;

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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'bkp-' } } });
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
    const slug = `bkp-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Bkp ${slug}`, slug });
    agencyId = tenant.id;
  }

  async function createCategory(code: string): Promise<string> {
    const category = await prisma.vehicleCategory.create({
      data: { tenantId: agencyId, code, name: code },
    });
    return category.id;
  }

  async function createVehicle(categoryId: string): Promise<string> {
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: agencyId,
        categoryId,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `T${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
      },
    });
    return vehicle.id;
  }

  async function createBranch(code: string, latitude: number | null, longitude: number | null): Promise<string> {
    const location = await prisma.location.create({
      data: { tenantId: agencyId, name: `Loc ${code}`, latitude, longitude },
    });
    for (let day = 0; day < 7; day++) {
      await prisma.locationHours.create({
        data: { locationId: location.id, dayOfWeek: day, opensAt: '08:00', closesAt: '18:00' },
      });
    }
    const branch = await prisma.branch.create({
      data: { tenantId: agencyId, name: `Branch ${code}`, code, locationId: location.id },
    });
    return branch.id;
  }

  async function createZone(): Promise<string> {
    const zone = await prisma.deliveryZone.create({
      data: { tenantId: agencyId, name: `Zone ${Date.now()}` },
    });
    return zone.id;
  }

  async function createPlan(overrides: Record<string, unknown> = {}): Promise<string> {
    const plan = await prisma.ratePlan.create({
      data: {
        tenantId: agencyId,
        code: `BASE${Date.now() % 100000}`,
        name: 'Base plan',
        currency: 'DZD',
        durationUnit: 'DAILY',
        baseRateMinor: 5000,
        precedence: 0,
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        ...overrides,
      },
    });
    return plan.id;
  }

  beforeEach(async () => {
    await createTenant();
  });

  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { id: agencyId } });
  });

  /** Tuesday 04:00Z (+4 days): units Tue→Fri — exactly one Friday unit. */
  function interval4Days(): { start: Date; end: Date } {
    const base = new Date(Date.now() + 14 * 86_400_000);
    base.setUTCHours(4, 0, 0, 0);
    const day = base.getUTCDay();
    const add = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
    const monday = new Date(base.getTime() + add * 86_400_000);
    const start = new Date(monday.getTime() + 86_400_000);
    const end = new Date(start.getTime() + 4 * 86_400_000);
    return { start, end };
  }

  it('prices a quote end-to-end with the full pipeline (06-D05/06 representative scenario)', async () => {
    const auth = await agencyToken('bkp-owner');
    const categoryId = await createCategory('ECON');
    const vehicleId = await createVehicle(categoryId);
    const pickupBranchId = await createBranch('PICK', 36.7538, 3.0588);
    const returnBranchId = await createBranch('RET', 35.6987, -0.6363);
    const deliveryZoneId = await createZone();

    const planId = await createPlan();
    await prisma.ratePlanTier.create({
      data: { ratePlanId: planId, upToUnits: 2, rateMinor: 6000 },
    });
    await prisma.ratePlanAdjustment.create({
      data: {
        ratePlanId: planId,
        kind: 'WEEKEND',
        adjustmentType: 'FLAT_PER_UNIT',
        windowStart: null,
        windowEnd: null,
        date: null,
        daysOfWeek: [5, 6],
        valueMinor: 1000,
        precedence: 10,
      },
    });
    await prisma.promotion.create({
      data: {
        tenantId: agencyId,
        code: 'SUMMER10',
        name: 'Summer promo',
        discountType: 'PERCENT',
        valueMinor: 1000,
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
      },
    });
    await prisma.feeRule.create({
      data: { tenantId: agencyId, kind: 'DELIVERY_FEE', deliveryZoneId, baseMinor: 2000 },
    });
    await prisma.feeRule.create({
      data: { tenantId: agencyId, kind: 'ONE_WAY_FEE', baseMinor: 1500 },
    });
    await prisma.feeRule.create({
      data: { tenantId: agencyId, kind: 'AFTER_HOURS_FEE', perOccurrenceMinor: 800 },
    });
    await prisma.depositPolicy.create({
      data: { tenantId: agencyId, name: 'Standard deposit', depositType: 'FIXED_MINOR', valueMinor: 50000 },
    });

    const { start, end } = interval4Days();
    const quote = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send({
        vehicleId,
        start: start.toISOString(),
        end: end.toISOString(),
        pickupBranchId,
        returnBranchId,
        deliveryZoneId,
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const pricing = (quote.body as { pricing: QuotePricingBody }).pricing;
    // Ladder 2×6000 + 2×5000 = 22 000; + Fri 1 000 → 23 000;
    // −10% promotion 2 300 → 20 700; + delivery 2 000 + one-way 1 500
    // + 2 after-hours occurrences (05:00 pickup Tue, 05:00 return Sat) 1 600
    // → 25 800 DZD, deposit 50 000.
    expect(pricing).toMatchObject({
      currency: 'DZD',
      totalMinor: 25_800,
      depositMinor: 50_000,
    });
    expect(pricing.breakdown).toEqual(
      expect.arrayContaining([
        { code: 'RENTAL', amountMinor: 22_000 },
        { code: 'TIME_WEEKEND', amountMinor: 1000 },
        { code: 'PROMOTION_DISCOUNT', amountMinor: -2300 },
        { code: 'DELIVERY_FEE', amountMinor: 2000 },
        { code: 'ONE_WAY_FEE', amountMinor: 1500 },
        { code: 'AFTER_HOURS_FEE', amountMinor: 1600 },
      ]),
    );
    const sum = (pricing.breakdown ?? []).reduce((acc, line) => acc + line.amountMinor, 0);
    expect(sum).toBe(pricing.totalMinor);
    expect(pricing.calculatedAt).toBeTruthy();
  });

  it('keeps quotes unpriced when no rate plan applies (06-D06 stable signal)', async () => {
    const auth = await agencyToken('bkp-owner');
    const categoryId = await createCategory('ECON');
    const vehicleId = await createVehicle(categoryId);
    const { start, end } = interval4Days();

    const quote = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send({ vehicleId, start: start.toISOString(), end: end.toISOString() })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((quote.body as { pricing: unknown }).pricing).toBeNull();
  });

  it('snapshots the authoritative price at confirmation and never rewrites it (06-D07/D08)', async () => {
    const auth = await agencyToken('bkp-owner');
    const categoryId = await createCategory('ECON');
    const vehicleId = await createVehicle(categoryId);
    const planId = await createPlan();

    const { start } = interval4Days();
    const oneDayEnd = new Date(start.getTime() + 86_400_000);

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings`)
      .send({ vehicleId, start: start.toISOString(), end: oneDayEnd.toISOString() })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const bookingId = (created.body as BookingBody).bookingId as string;

    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/hold`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const quote = await api(app)
      .post(`/api/v1/agencies/${agencyId}/quotes`)
      .send({ vehicleId, start: start.toISOString(), end: oneDayEnd.toISOString() })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    const quoteId = (quote.body as { quoteId: string }).quoteId;
    const pricing = (quote.body as { pricing: QuotePricingBody }).pricing;
    expect(pricing?.totalMinor).toBe(5000);

    const customerId = await appUserId('bkp-customer');
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/request-confirmation`)
      .send({ customerId, quoteId })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);

    const snapshot = await prisma.bookingPriceSnapshot.findFirst({ where: { bookingId } });
    expect((snapshot?.pricingJson as { totalMinor?: number } | null)?.totalMinor).toBe(5000);

    // Changing the plan afterwards must not rewrite the stored terms.
    await api(app)
      .patch(`/api/v1/agencies/${agencyId}/pricing/rate-plans/${planId}`)
      .send({ baseRateMinor: 9999 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    const still = await prisma.bookingPriceSnapshot.findFirst({ where: { bookingId } });
    expect((still?.pricingJson as { totalMinor?: number } | null)?.totalMinor).toBe(5000);

    // A repeated confirmation is rejected and never duplicates the snapshot.
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect(await prisma.bookingPriceSnapshot.count({ where: { bookingId } })).toBe(1);
  });

  it('produces identical totals for concurrent identical quotes (06-D09)', async () => {
    const auth = await agencyToken('bkp-owner');
    const categoryId = await createCategory('ECON');
    const vehicleId = await createVehicle(categoryId);
    await createPlan();

    const { start, end } = interval4Days();
    const body = { vehicleId, start: start.toISOString(), end: end.toISOString() };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(app)
          .post(`/api/v1/agencies/${agencyId}/quotes`)
          .send(body)
          .set('Authorization', `Bearer ${auth}`),
      ),
    );
    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const totals = responses.map(
      (response) => (response.body as { pricing: QuotePricingBody }).pricing?.totalMinor,
    );
    // 4 days × 5 000 DZD, no tiers/adjustments/fees — identical for every
    // concurrent request.
    expect(new Set(totals)).toEqual(new Set([20_000]));
  });
});
