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
 * PHASE-06 / 06-C commercial-adjustment administration integration tests:
 * promotions (+eligibility scopes), coupons, the agency-priced extras
 * catalog, context fee rules (delivery/distance/one-way/after-hours) and
 * deposit policies — over real HTTP + PostgreSQL with tenant scope,
 * role-based permissions, uniqueness constraints and boundary validation.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4148;

describe('Commercial adjustments administration (integration)', () => {
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
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'bkc-' } } });
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
    roles: Array<'AGENCY_OWNER_ADMIN' | 'FINANCE'> = ['AGENCY_OWNER_ADMIN'],
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
    const slug = `bkc-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Bkc ${slug}`, slug });
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
        plateNumber: `C${Date.now() % 1000000}${Math.floor(Math.random() * 10)}`,
      },
    });
    return vehicle.id;
  }

  async function createBranch(): Promise<string> {
    const location = await prisma.location.create({
      data: { tenantId: agencyId, name: `Loc ${Date.now()}` },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: agencyId,
        name: `Branch ${Date.now()}`,
        code: `B${Date.now() % 100000}`,
        locationId: location.id,
      },
    });
    return branch.id;
  }

  async function createZone(): Promise<string> {
    const zone = await prisma.deliveryZone.create({
      data: { tenantId: agencyId, name: `Zone ${Date.now()}` },
    });
    return zone.id;
  }

  beforeEach(async () => {
    await createTenant();
  });

  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { id: agencyId } });
  });

  const promotionBody = (overrides: Record<string, unknown> = {}) => ({
    code: 'SUMMER10',
    name: 'Summer promo',
    discountType: 'PERCENT',
    valueMinor: 1000,
    effectiveFrom: '2026-08-01T00:00:00Z',
    ...overrides,
  });

  it('administers promotions with scopes, boundaries and code uniqueness (06-C01/09)', async () => {
    const auth = await agencyToken('bkc-owner');
    const categoryId = await createCategory('ECON');
    const vehicleId = await createVehicle(categoryId);
    const branchId = await createBranch();

    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/promotions`)
      .send(promotionBody({ code: ' summer10 ', scopes: [{ vehicleId, categoryId, branchId }] }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect(created.body).toMatchObject({
      code: 'SUMMER10',
      discountType: 'PERCENT',
      valueMinor: 1000,
      active: true,
      scopes: [{ vehicleId, categoryId, branchId }],
    });
    const promotionId = (created.body as { promotionId: string }).promotionId;

    const list = await api(app)
      .get(`/api/v1/agencies/${agencyId}/pricing/commercial/promotions`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const patched = await api(app)
      .patch(`/api/v1/agencies/${agencyId}/pricing/commercial/promotions/${promotionId}`)
      .send({ active: false })
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((patched.body as { active: boolean }).active).toBe(false);

    const duplicate = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/promotions`)
      .send(promotionBody({ name: 'Another' }))
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((duplicate.body as ApiErrorBody).error.code).toBe('PROMOTION_CODE_TAKEN');

    const cases: Array<[Record<string, unknown>, string]> = [
      [promotionBody({ code: 'no space!' }), 'PROMOTION_CODE_INVALID'],
      [promotionBody({ code: 'BADVALUE', valueMinor: -1 }), 'PROMOTION_VALUE_INVALID'],
      [
        promotionBody({ code: 'BADWINDOW', effectiveUntil: '2026-07-01T00:00:00Z' }),
        'PROMOTION_WINDOW_INVALID',
      ],
      [
        promotionBody({
          code: 'GHOSTSCOPE',
          scopes: [{ vehicleId: '00000000-0000-4000-8000-000000000000' }],
        }),
        'VEHICLE_NOT_FOUND',
      ],
    ];
    for (const [body, code] of cases) {
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/pricing/commercial/promotions`)
        .send(body)
        .set('Authorization', `Bearer ${auth}`)
        .expect(409);
      expect((res.body as ApiErrorBody).error.code).toBe(code);
    }
  });

  it('enforces pricing permissions: FINANCE reads but never manages (06-C)', async () => {
    const ownerAuth = await agencyToken('bkc-owner');
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/promotions`)
      .send(promotionBody())
      .set('Authorization', `Bearer ${ownerAuth}`)
      .expect(201);

    const financeAuth = await agencyToken('bkc-finance', ['FINANCE']);
    await api(app)
      .get(`/api/v1/agencies/${agencyId}/pricing/commercial/promotions`)
      .set('Authorization', `Bearer ${financeAuth}`)
      .expect(200);
    await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/coupons`)
      .send({ code: 'FINCOUPON', name: 'Finance coupon', discountType: 'PERCENT', valueMinor: 100, effectiveFrom: '2026-08-01T00:00:00Z' })
      .set('Authorization', `Bearer ${financeAuth}`)
      .expect(403);
  });

  it('administers coupons with windows, caps and uniqueness (06-C02)', async () => {
    const auth = await agencyToken('bkc-owner');
    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/coupons`)
      .send({
        code: ' welcome20 ',
        name: 'Welcome coupon',
        discountType: 'PERCENT',
        valueMinor: 2000,
        effectiveFrom: '2026-08-01T00:00:00Z',
        maxUses: 100,
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect(created.body).toMatchObject({
      code: 'WELCOME20',
      maxUses: 100,
      usedCount: 0,
      active: true,
    });
    const couponId = (created.body as { couponId: string }).couponId;

    const patched = await api(app)
      .patch(`/api/v1/agencies/${agencyId}/pricing/commercial/coupons/${couponId}`)
      .send({ maxUses: 250 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((patched.body as { maxUses: number }).maxUses).toBe(250);

    const duplicate = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/coupons`)
      .send({
        code: 'WELCOME20',
        name: 'Duplicate',
        discountType: 'PERCENT',
        valueMinor: 100,
        effectiveFrom: '2026-08-01T00:00:00Z',
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((duplicate.body as ApiErrorBody).error.code).toBe('COUPON_CODE_TAKEN');

    const badWindow = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/coupons`)
      .send({
        code: 'BADWINDOW',
        name: 'Bad window',
        discountType: 'PERCENT',
        valueMinor: 100,
        effectiveFrom: 'not-a-date',
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((badWindow.body as ApiErrorBody).error.code).toBe('COUPON_WINDOW_INVALID');
  });

  it('administers the agency-priced extras catalog (06-C03)', async () => {
    const auth = await agencyToken('bkc-owner');
    const created = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/extras`)
      .send({ key: ' gps ', type: 'GPS_DEVICE', name: 'GPS device', pricingUnit: 'PER_DAY', amountMinor: 500 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect(created.body).toMatchObject({
      key: 'GPS',
      type: 'GPS_DEVICE',
      pricingUnit: 'PER_DAY',
      amountMinor: 500,
      active: true,
    });

    const duplicate = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/extras`)
      .send({ key: 'GPS', type: 'GPS_DEVICE', name: 'GPS again', pricingUnit: 'PER_DAY', amountMinor: 500 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((duplicate.body as ApiErrorBody).error.code).toBe('EXTRA_KEY_TAKEN');

    const badType = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/extras`)
      .send({ key: 'BADTYPE', type: 'NOPE', name: 'Bad', pricingUnit: 'PER_DAY', amountMinor: 500 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((badType.body as ApiErrorBody).error.code).toBe('EXTRA_TYPE_INVALID');

    const badAmount = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/extras`)
      .send({ key: 'BADAMOUNT', type: 'GPS_DEVICE', name: 'Bad', pricingUnit: 'PER_DAY', amountMinor: -1 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((badAmount.body as ApiErrorBody).error.code).toBe('EXTRA_AMOUNT_INVALID');
  });

  it('administers context fee rules with kind-specific constraints (06-C04..C07)', async () => {
    const auth = await agencyToken('bkc-owner');
    const zoneId = await createZone();
    const branchId = await createBranch();

    const delivery = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/fee-rules`)
      .send({ kind: 'DELIVERY_FEE', deliveryZoneId: zoneId, baseMinor: 2000 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect(delivery.body).toMatchObject({
      kind: 'DELIVERY_FEE',
      deliveryZoneId: zoneId,
      baseMinor: 2000,
      active: true,
    });

    const afterHours = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/fee-rules`)
      .send({ kind: 'AFTER_HOURS_FEE', branchId, perOccurrenceMinor: 1500 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((afterHours.body as { perOccurrenceMinor: number }).perOccurrenceMinor).toBe(1500);

    const cases: Array<[Record<string, unknown>, string]> = [
      [{ kind: 'NOPE', baseMinor: 1 }, 'FEE_RULE_INVALID'],
      [{ kind: 'DISTANCE_FEE', baseMinor: 1 }, 'FEE_RULE_INVALID'],
      [{ kind: 'DISTANCE_FEE', deliveryZoneId: zoneId, baseMinor: 1, perKmMinor: -1 }, 'FEE_RULE_INVALID'],
      [{ kind: 'ONE_WAY_FEE', deliveryZoneId: zoneId, baseMinor: 1 }, 'FEE_RULE_TARGET_INVALID'],
      [{ kind: 'AFTER_HOURS_FEE', branchId, perOccurrenceMinor: 0 }, 'FEE_RULE_INVALID'],
      [
        { kind: 'DELIVERY_FEE', deliveryZoneId: '00000000-0000-4000-8000-000000000000', baseMinor: 1 },
        'DELIVERY_ZONE_NOT_FOUND',
      ],
    ];
    for (const [body, code] of cases) {
      const res = await api(app)
        .post(`/api/v1/agencies/${agencyId}/pricing/commercial/fee-rules`)
        .send(body)
        .set('Authorization', `Bearer ${auth}`)
        .expect(409);
      expect((res.body as ApiErrorBody).error.code).toBe(code);
    }
  });

  it('administers deposit policies with vehicle/category overrides (06-C08)', async () => {
    const auth = await agencyToken('bkc-owner');
    const categoryId = await createCategory('ECON');
    const vehicleId = await createVehicle(categoryId);

    const global = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/deposit-policies`)
      .send({ name: 'Standard deposit', depositType: 'FIXED_MINOR', valueMinor: 50000 })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect(global.body).toMatchObject({
      depositType: 'FIXED_MINOR',
      valueMinor: 50000,
      active: true,
      scopes: [],
    });
    const policyId = (global.body as { depositPolicyId: string }).depositPolicyId;

    const scoped = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/deposit-policies`)
      .send({
        name: 'Premium deposit',
        depositType: 'PERCENT_OF_TOTAL',
        valueMinor: 2000,
        scopes: [{ vehicleId }],
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    expect((scoped.body as { scopes: unknown[] }).scopes).toEqual([
      { vehicleId, categoryId: null },
    ]);

    const patched = await api(app)
      .patch(`/api/v1/agencies/${agencyId}/pricing/commercial/deposit-policies/${policyId}`)
      .send({ scopes: [{ categoryId }] })
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);
    expect((patched.body as { scopes: unknown[] }).scopes).toEqual([
      { vehicleId: null, categoryId },
    ]);

    const badScope = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/deposit-policies`)
      .send({ name: 'Bad scope', depositType: 'FIXED_MINOR', valueMinor: 1000, scopes: [{ vehicleId: null, categoryId: null }] })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((badScope.body as ApiErrorBody).error.code).toBe('DEPOSIT_POLICY_SCOPE_INVALID');

    const ghost = await api(app)
      .post(`/api/v1/agencies/${agencyId}/pricing/commercial/deposit-policies`)
      .send({
        name: 'Ghost',
        depositType: 'FIXED_MINOR',
        valueMinor: 1000,
        scopes: [{ categoryId: '00000000-0000-4000-8000-000000000000' }],
      })
      .set('Authorization', `Bearer ${auth}`)
      .expect(409);
    expect((ghost.body as ApiErrorBody).error.code).toBe('CATEGORY_NOT_FOUND');
  });
});
