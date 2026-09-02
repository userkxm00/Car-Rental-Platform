import { Prisma } from '@prisma/client';
import { AvailabilityService } from '../../availability/application/availability.service';
import type { AvailabilityRepository } from '../../availability/infrastructure/availability.repository';
import { BranchesService } from '../../locations/application/branches.service';
import { DeliveryZonesService } from '../../locations/application/delivery-zones.service';
import type { LocationsRepository } from '../../locations/infrastructure/locations.repository';
import {
  CommercialService,
} from './commercial.service';
import type {
  CouponRow,
  CommercialRepository,
  DepositPolicyRow,
  ExtraRow,
  FeeRuleRow,
  PromotionRow,
} from '../infrastructure/commercial.repository';

/**
 * 06-C administration service tests over a fake commercial repository and
 * REAL availability/locations services (scope-target validation must stay
 * tenant-scoped): boundary matrix, code normalization, uniqueness mapping,
 * PATCH merge semantics and child-set replacement.
 */

function makeAvailabilityRepository(
  overrides: Partial<AvailabilityRepository> = {},
): AvailabilityRepository {
  return {
    findVehicleInTenant: jest.fn(() => Promise.resolve(null)),
    findCategoryInTenant: jest.fn(() => Promise.resolve(null)),
    findConflictingBlocks: jest.fn(() => Promise.resolve([])),
    findConflictingHolds: jest.fn(() => Promise.resolve([])),
    listAvailable: jest.fn(() => Promise.resolve([])),
    countEligible: jest.fn(() => Promise.resolve(0)),
    countCommitted: jest.fn(() => Promise.resolve(0)),
    scheduleCommitments: jest.fn(() => Promise.resolve([])),
    ...overrides,
  } as unknown as AvailabilityRepository;
}

function makeLocationsRepository(
  overrides: Partial<LocationsRepository> = {},
): LocationsRepository {
  return {
    findBranch: jest.fn(() => Promise.resolve(undefined)),
    listBranches: jest.fn(() => Promise.resolve([])),
    listDeliveryZones: jest.fn(() => Promise.resolve([])),
    ...overrides,
  } as unknown as LocationsRepository;
}

function zoneFixture(): {
  name: string;
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
  feePolicyReference: string | null;
} {
  return {
    name: 'Zone 1',
    id: 'zone-1',
    tenantId: 'ag1',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    active: true,
    feePolicyReference: null,
  };
}

function branchFixture(): {
  name: string;
  id: string;
  tenantId: string;
  code: string;
  locationId: string;
  status: 'ACTIVE';
  timezone: null;
  contacts: Record<string, never>;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    name: 'Branch 1',
    id: 'b-1',
    tenantId: 'ag1',
    code: 'B1',
    locationId: 'loc-1',
    status: 'ACTIVE' as const,
    timezone: null,
    contacts: {},
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

function makeCommercialRepository(): CommercialRepository {
  return {
    createPromotion: jest.fn(),
    findPromotion: jest.fn(() => Promise.resolve(null)),
    listPromotions: jest.fn(() => Promise.resolve([])),
    updatePromotion: jest.fn(() => Promise.resolve(null)),
    createCoupon: jest.fn(),
    findCoupon: jest.fn(() => Promise.resolve(null)),
    findCouponByCode: jest.fn(() => Promise.resolve(null)),
    listCoupons: jest.fn(() => Promise.resolve([])),
    updateCoupon: jest.fn(() => Promise.resolve(null)),
    createExtra: jest.fn(),
    findExtra: jest.fn(() => Promise.resolve(null)),
    listExtras: jest.fn(() => Promise.resolve([])),
    updateExtra: jest.fn(() => Promise.resolve(null)),
    createFeeRule: jest.fn(),
    findFeeRule: jest.fn(() => Promise.resolve(null)),
    listFeeRules: jest.fn(() => Promise.resolve([])),
    listActiveFeeRuleCandidates: jest.fn(() => Promise.resolve([])),
    updateFeeRule: jest.fn(() => Promise.resolve(null)),
    createDepositPolicy: jest.fn(),
    findDepositPolicy: jest.fn(() => Promise.resolve(null)),
    listDepositPolicies: jest.fn(() => Promise.resolve([])),
    updateDepositPolicy: jest.fn(() => Promise.resolve(null)),
  } as unknown as CommercialRepository;
}

function promotionRow(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id: 'promo-1',
    tenantId: 'ag1',
    code: 'SUMMER10',
    name: 'Summer promo',
    discountType: 'PERCENT',
    valueMinor: 1000,
    minDurationUnits: null,
    durationUnit: null,
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    effectiveUntil: null,
    maxRedemptions: null,
    redemptionsCount: 0,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    scopes: [],
    ...overrides,
  };
}

function couponRow(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: 'coupon-1',
    tenantId: 'ag1',
    code: 'WELCOME20',
    name: 'Welcome coupon',
    discountType: 'PERCENT',
    valueMinor: 2000,
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    effectiveUntil: null,
    maxUses: null,
    usedCount: 0,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function extraRow(overrides: Partial<ExtraRow> = {}): ExtraRow {
  return {
    id: 'extra-1',
    tenantId: 'ag1',
    key: 'GPS',
    type: 'GPS_DEVICE',
    name: 'GPS device',
    pricingUnit: 'PER_DAY',
    amountMinor: 500,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function feeRuleRow(overrides: Partial<FeeRuleRow> = {}): FeeRuleRow {
  return {
    id: 'fee-1',
    tenantId: 'ag1',
    kind: 'DELIVERY_FEE',
    deliveryZoneId: 'zone-1',
    branchId: null,
    baseMinor: 2000,
    perKmMinor: null,
    perOccurrenceMinor: null,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function depositRow(overrides: Partial<DepositPolicyRow> = {}): DepositPolicyRow {
  return {
    id: 'dep-1',
    tenantId: 'ag1',
    name: 'Standard deposit',
    depositType: 'FIXED_MINOR',
    valueMinor: 50_000,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    scopes: [],
    ...overrides,
  };
}

function p2002(): Error {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function makeService(overrides: {
  commercial?: Partial<CommercialRepository>;
  availability?: Partial<AvailabilityRepository>;
  locations?: Partial<LocationsRepository>;
} = {}): {
  service: CommercialService;
  commercial: CommercialRepository;
  availability: AvailabilityRepository;
  locations: LocationsRepository;
} {
  const commercial = {
    ...makeCommercialRepository(),
    ...overrides.commercial,
  } as unknown as CommercialRepository;
  const availabilityRepo = makeAvailabilityRepository(overrides.availability);
  const locationsRepo = makeLocationsRepository(overrides.locations);
  const service = new CommercialService(
    commercial,
    new AvailabilityService(availabilityRepo),
    new BranchesService(locationsRepo),
    new DeliveryZonesService(locationsRepo),
  );
  return { service, commercial, availability: availabilityRepo, locations: locationsRepo };
}

const VALID_PROMOTION = {
  code: 'SUMMER10',
  name: 'Summer promo',
  discountType: 'PERCENT' as const,
  valueMinor: 1000,
  effectiveFrom: '2026-08-01T00:00:00Z',
  effectiveUntil: null,
  scopes: [],
};

describe('CommercialService promotions (06-C01/09)', () => {
  it('creates a promotion with normalized code and returns the response shape', async () => {
    const { service, commercial } = makeService({
      commercial: { createPromotion: jest.fn(() => Promise.resolve(promotionRow())) },
    });
    const result = await service.createPromotion('ag1', {
      ...VALID_PROMOTION,
      code: ' summer10 ',
    });
    expect(result.promotionId).toBe('promo-1');
    expect(result.code).toBe('SUMMER10');
    expect(commercial.createPromotion as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'ag1', code: 'SUMMER10', active: true }),
    );
  });

  it('rejects the promotion boundary violation matrix with stable codes', async () => {
    const { service } = makeService();
    await expect(
      service.createPromotion('ag1', { ...VALID_PROMOTION, code: 'no space!' }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_CODE_INVALID' } });
    await expect(
      service.createPromotion('ag1', { ...VALID_PROMOTION, name: '' }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_NAME_INVALID' } });
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        discountType: 'BOGUS',
      }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_VALUE_INVALID' } });
    await expect(
      service.createPromotion('ag1', { ...VALID_PROMOTION, valueMinor: -1 }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_VALUE_INVALID' } });
    await expect(
      service.createPromotion('ag1', { ...VALID_PROMOTION, valueMinor: 1_000_001, discountType: 'PERCENT' }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_VALUE_INVALID' } });
    await expect(
      service.createPromotion('ag1', { ...VALID_PROMOTION, effectiveFrom: 'not-a-date' }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_WINDOW_INVALID' } });
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        effectiveUntil: '2026-08-01T00:00:00Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_WINDOW_INVALID' } });
    await expect(
      service.createPromotion('ag1', { ...VALID_PROMOTION, minDurationUnits: 3 }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_DURATION_INVALID' } });
    await expect(
      service.createPromotion('ag1', { ...VALID_PROMOTION, maxRedemptions: -1 }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_VALUE_INVALID' } });
  });

  it('rejects empty, duplicate or out-of-tenant promotion scopes', async () => {
    const { service } = makeService();
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        scopes: [{ vehicleId: null, categoryId: null, branchId: null }],
      }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_SCOPE_INVALID' } });
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        scopes: [
          { vehicleId: 'v-1', categoryId: null, branchId: null },
          { vehicleId: 'v-1', categoryId: null, branchId: null },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'PROMOTION_SCOPE_INVALID' } });
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        scopes: [{ vehicleId: 'ghost', categoryId: null, branchId: null }],
      }),
    ).rejects.toMatchObject({ response: { code: 'VEHICLE_NOT_FOUND' } });
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        scopes: [{ vehicleId: null, categoryId: 'ghost', branchId: null }],
      }),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_NOT_FOUND' } });
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        scopes: [{ vehicleId: null, categoryId: null, branchId: 'ghost' }],
      }),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_NOT_FOUND' } });
  });

  it('accepts a valid scoped promotion against tenant-owned targets', async () => {
    const { service, commercial } = makeService({
      commercial: { createPromotion: jest.fn(() => Promise.resolve(promotionRow())) },
      availability: {
        findVehicleInTenant: jest.fn(() =>
          Promise.resolve({ id: 'v-1', categoryId: 'cat-1', status: 'AVAILABLE', currentBranchId: null }),
        ),
        findCategoryInTenant: jest.fn(() =>
          Promise.resolve({ id: 'c-1', active: true }),
        ),
      },
      locations: { findBranch: jest.fn(() => Promise.resolve(branchFixture())) },
    });
    await expect(
      service.createPromotion('ag1', {
        ...VALID_PROMOTION,
        scopes: [{ vehicleId: 'v-1', categoryId: 'c-1', branchId: 'b-1' }],
      }),
    ).resolves.toMatchObject({ promotionId: 'promo-1' });
    expect(commercial.createPromotion as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: [{ vehicleId: 'v-1', categoryId: 'c-1', branchId: 'b-1' }],
      }),
    );
  });

  it('maps unique violations to PROMOTION_CODE_TAKEN', async () => {
    const { service } = makeService({
      commercial: { createPromotion: jest.fn(() => Promise.reject(p2002())) },
    });
    await expect(service.createPromotion('ag1', VALID_PROMOTION)).rejects.toMatchObject({
      response: { code: 'PROMOTION_CODE_TAKEN' },
    });
  });

  it('reads with 404 mapping and updates with PATCH merge + optional scope replacement', async () => {
    const update = jest.fn(() =>
      Promise.resolve(promotionRow({ active: false, scopes: [{ vehicleId: 'v-1', categoryId: null, branchId: null }] })),
    );
    const { service, commercial } = makeService({
      commercial: {
        findPromotion: jest.fn((_tenantId: string, id: string) =>
          Promise.resolve(id === 'promo-1' ? promotionRow() : null),
        ),
        listPromotions: jest.fn(() => Promise.resolve([promotionRow()])),
        updatePromotion: update,
      },
      availability: {
        findVehicleInTenant: jest.fn(() =>
          Promise.resolve({ id: 'v-1', categoryId: 'cat-1', status: 'AVAILABLE', currentBranchId: null }),
        ),
      },
    });
    await expect(service.getPromotion('ag1', 'ghost')).rejects.toMatchObject({
      response: { code: 'PROMOTION_NOT_FOUND' },
    });
    expect(await service.listPromotions('ag1')).toHaveLength(1);

    // Partial patch: scopes omitted → repository must not replace them.
    await service.updatePromotion('ag1', 'promo-1', { active: false });
    expect(commercial.updatePromotion as jest.Mock).toHaveBeenLastCalledWith(
      'ag1',
      'promo-1',
      expect.objectContaining({ code: 'SUMMER10', name: 'Summer promo', active: false }),
      undefined,
    );

    // Scopes provided → replaced with validated rows.
    await service.updatePromotion('ag1', 'promo-1', {
      scopes: [{ vehicleId: 'v-1', categoryId: null, branchId: null }],
    });
    expect(commercial.updatePromotion as jest.Mock).toHaveBeenLastCalledWith(
      'ag1',
      'promo-1',
      expect.objectContaining({ active: true }),
      [{ vehicleId: 'v-1', categoryId: null, branchId: null }],
    );
  });
});

describe('CommercialService coupons (06-C02)', () => {
  const VALID_COUPON = {
    code: 'WELCOME20',
    name: 'Welcome coupon',
    discountType: 'PERCENT' as const,
    valueMinor: 2000,
    effectiveFrom: '2026-08-01T00:00:00Z',
  };

  it('creates a coupon with a normalized code and unique-code conflict mapping', async () => {
    const { service, commercial } = makeService({
      commercial: { createCoupon: jest.fn(() => Promise.resolve(couponRow())) },
    });
    const result = await service.createCoupon('ag1', { ...VALID_COUPON, code: ' welcome20 ' });
    expect(result.code).toBe('WELCOME20');
    expect(commercial.createCoupon as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'ag1', code: 'WELCOME20' }),
    );

    const conflict = makeService({
      commercial: { createCoupon: jest.fn(() => Promise.reject(p2002())) },
    });
    await expect(conflict.service.createCoupon('ag1', VALID_COUPON)).rejects.toMatchObject({
      response: { code: 'COUPON_CODE_TAKEN' },
    });
  });

  it('rejects invalid coupon codes, windows, values and usage caps', async () => {
    const { service } = makeService();
    await expect(
      service.createCoupon('ag1', { ...VALID_COUPON, code: 'x' }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_CODE_INVALID' } });
    await expect(
      service.createCoupon('ag1', { ...VALID_COUPON, name: '' }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_NAME_INVALID' } });
    await expect(
      service.createCoupon('ag1', { ...VALID_COUPON, valueMinor: 1.5 }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_VALUE_INVALID' } });
    await expect(
      service.createCoupon('ag1', { ...VALID_COUPON, effectiveFrom: 'nope' }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_WINDOW_INVALID' } });
    await expect(
      service.createCoupon('ag1', { ...VALID_COUPON, maxUses: -1 }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_VALUE_INVALID' } });
  });

  it('updates coupons with merge semantics and 404 mapping', async () => {
    const { service } = makeService({
      commercial: {
        findCoupon: jest.fn((_tenantId: string, id: string) =>
          Promise.resolve(id === 'coupon-1' ? couponRow() : null),
        ),
        updateCoupon: jest.fn((_tenantId: string, _id: string, data: Partial<CouponRow>) =>
          Promise.resolve(couponRow(data)),
        ),
      },
    });
    await expect(service.updateCoupon('ag1', 'ghost', { active: false })).rejects.toMatchObject({
      response: { code: 'COUPON_NOT_FOUND' },
    });
    await expect(
      service.updateCoupon('ag1', 'coupon-1', { maxUses: 5 }),
    ).resolves.toMatchObject({ couponId: 'coupon-1', maxUses: 5 });
  });
});

describe('CommercialService extras (06-C03)', () => {
  const VALID_EXTRA = {
    key: 'GPS',
    type: 'GPS_DEVICE' as const,
    name: 'GPS device',
    pricingUnit: 'PER_DAY' as const,
    amountMinor: 500,
  };

  it('creates an extra from the agency catalog and maps key conflicts', async () => {
    const { service, commercial } = makeService({
      commercial: { createExtra: jest.fn(() => Promise.resolve(extraRow())) },
    });
    const result = await service.createExtra('ag1', { ...VALID_EXTRA, key: ' gps ' });
    expect(result.key).toBe('GPS');
    expect(commercial.createExtra as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'ag1', key: 'GPS' }),
    );

    const conflict = makeService({
      commercial: { createExtra: jest.fn(() => Promise.reject(p2002())) },
    });
    await expect(conflict.service.createExtra('ag1', VALID_EXTRA)).rejects.toMatchObject({
      response: { code: 'EXTRA_KEY_TAKEN' },
    });
  });

  it('rejects invalid extra types, units and amounts', async () => {
    const { service } = makeService();
    await expect(
      service.createExtra('ag1', { ...VALID_EXTRA, type: 'NOPE' }),
    ).rejects.toMatchObject({ response: { code: 'EXTRA_TYPE_INVALID' } });
    await expect(
      service.createExtra('ag1', { ...VALID_EXTRA, pricingUnit: 'NOPE' }),
    ).rejects.toMatchObject({ response: { code: 'EXTRA_UNIT_INVALID' } });
    await expect(
      service.createExtra('ag1', { ...VALID_EXTRA, amountMinor: -1 }),
    ).rejects.toMatchObject({ response: { code: 'EXTRA_AMOUNT_INVALID' } });
    await expect(
      service.createExtra('ag1', { ...VALID_EXTRA, amountMinor: 1_000_000_001 }),
    ).rejects.toMatchObject({ response: { code: 'EXTRA_AMOUNT_INVALID' } });
    await expect(
      service.createExtra('ag1', { ...VALID_EXTRA, key: 'not a key' }),
    ).rejects.toMatchObject({ response: { code: 'EXTRA_KEY_INVALID' } });
    await expect(
      service.createExtra('ag1', { ...VALID_EXTRA, name: '' }),
    ).rejects.toMatchObject({ response: { code: 'EXTRA_NAME_INVALID' } });
  });

  it('lists extras and maps missing extras to 404', async () => {
    const { service } = makeService({
      commercial: { listExtras: jest.fn(() => Promise.resolve([extraRow()])) },
    });
    expect(await service.listExtras('ag1')).toHaveLength(1);
    await expect(service.getExtra('ag1', 'ghost')).rejects.toMatchObject({
      response: { code: 'EXTRA_NOT_FOUND' },
    });
  });
});

describe('CommercialService fee rules (06-C04..C07)', () => {
  it('creates a DELIVERY_FEE targeting a tenant zone', async () => {
    const { service } = makeService({
      commercial: { createFeeRule: jest.fn(() => Promise.resolve(feeRuleRow())) },
      locations: {
        listDeliveryZones: jest.fn(() => Promise.resolve([zoneFixture()])),
      },
    });
    const result = await service.createFeeRule('ag1', {
      kind: 'DELIVERY_FEE',
      deliveryZoneId: 'zone-1',
      baseMinor: 2000,
    });
    expect(result.feeRuleId).toBe('fee-1');
  });

  it('rejects unknown kinds and misplaced targets', async () => {
    const { service } = makeService({
      locations: {
        listDeliveryZones: jest.fn(() => Promise.resolve([zoneFixture()])),
        findBranch: jest.fn(() => Promise.resolve(branchFixture())),
      },
    });
    await expect(
      service.createFeeRule('ag1', { kind: 'NOPE', baseMinor: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FEE_RULE_INVALID' } });
    await expect(
      service.createFeeRule('ag1', { kind: 'ONE_WAY_FEE', baseMinor: 1, deliveryZoneId: 'zone-1' }),
    ).rejects.toMatchObject({ response: { code: 'FEE_RULE_TARGET_INVALID' } });
    await expect(
      service.createFeeRule('ag1', { kind: 'DELIVERY_FEE', baseMinor: 1, branchId: 'b-1' }),
    ).rejects.toMatchObject({ response: { code: 'FEE_RULE_TARGET_INVALID' } });
    await expect(
      service.createFeeRule('ag1', {
        kind: 'DISTANCE_FEE',
        deliveryZoneId: 'zone-1',
        baseMinor: 1,
        perKmMinor: -1,
      }),
    ).rejects.toMatchObject({ response: { code: 'FEE_RULE_INVALID' } });
  });

  it('requires the structural payload per kind', async () => {
    const { service } = makeService({
      locations: {
        listDeliveryZones: jest.fn(() => Promise.resolve([zoneFixture()])),
      },
    });
    // DISTANCE_FEE without a zone or perKmMinor.
    await expect(
      service.createFeeRule('ag1', { kind: 'DISTANCE_FEE', baseMinor: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FEE_RULE_INVALID' } });
    await expect(
      service.createFeeRule('ag1', { kind: 'DISTANCE_FEE', baseMinor: 1, perKmMinor: 100 }),
    ).rejects.toMatchObject({ response: { code: 'FEE_RULE_INVALID' } });
    // AFTER_HOURS_FEE without a positive perOccurrenceMinor.
    await expect(
      service.createFeeRule('ag1', { kind: 'AFTER_HOURS_FEE', baseMinor: 1 }),
    ).rejects.toMatchObject({ response: { code: 'FEE_RULE_INVALID' } });
  });

  it('rejects out-of-tenant zone/branch references', async () => {
    const { service } = makeService();
    await expect(
      service.createFeeRule('ag1', {
        kind: 'DELIVERY_FEE',
        deliveryZoneId: 'foreign-zone',
        baseMinor: 1,
      }),
    ).rejects.toMatchObject({ response: { code: 'DELIVERY_ZONE_NOT_FOUND' } });
    await expect(
      service.createFeeRule('ag1', { kind: 'AFTER_HOURS_FEE', branchId: 'foreign-b', perOccurrenceMinor: 100 }),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_NOT_FOUND' } });
  });

  it('updates fee rules with merge semantics and 404 mapping', async () => {
    const { service } = makeService({
      commercial: {
        findFeeRule: jest.fn((_tenantId: string, id: string) =>
          Promise.resolve(id === 'fee-1' ? feeRuleRow() : null),
        ),
        updateFeeRule: jest.fn((_tenantId: string, _id: string, data: Partial<FeeRuleRow>) =>
          Promise.resolve(feeRuleRow(data)),
        ),
      },
      locations: {
        listDeliveryZones: jest.fn(() => Promise.resolve([zoneFixture()])),
      },
    });
    await expect(service.updateFeeRule('ag1', 'ghost', { active: false })).rejects.toMatchObject({
      response: { code: 'FEE_RULE_NOT_FOUND' },
    });
    await expect(
      service.updateFeeRule('ag1', 'fee-1', { baseMinor: 3000 }),
    ).resolves.toMatchObject({ feeRuleId: 'fee-1', baseMinor: 3000 });
  });
});

describe('CommercialService deposit policies (06-C08)', () => {
  const VALID_DEPOSIT = {
    name: 'Standard deposit',
    depositType: 'FIXED_MINOR' as const,
    valueMinor: 50_000,
    scopes: [],
  };

  it('creates a global fixed deposit policy', async () => {
    const { service } = makeService({
      commercial: { createDepositPolicy: jest.fn(() => Promise.resolve(depositRow())) },
    });
    const result = await service.createDepositPolicy('ag1', VALID_DEPOSIT);
    expect(result.depositPolicyId).toBe('dep-1');
  });

  it('rejects invalid deposit types, values and scopes', async () => {
    const { service } = makeService();
    await expect(
      service.createDepositPolicy('ag1', { ...VALID_DEPOSIT, name: '' }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSIT_POLICY_NAME_INVALID' } });
    await expect(
      service.createDepositPolicy('ag1', { ...VALID_DEPOSIT, depositType: 'NOPE' }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSIT_POLICY_VALUE_INVALID' } });
    await expect(
      service.createDepositPolicy('ag1', { ...VALID_DEPOSIT, valueMinor: -1 }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSIT_POLICY_VALUE_INVALID' } });
    await expect(
      service.createDepositPolicy('ag1', {
        ...VALID_DEPOSIT,
        depositType: 'PERCENT_OF_TOTAL',
        valueMinor: 1_000_001,
      }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSIT_POLICY_VALUE_INVALID' } });
    await expect(
      service.createDepositPolicy('ag1', {
        ...VALID_DEPOSIT,
        scopes: [{ vehicleId: null, categoryId: null }],
      }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSIT_POLICY_SCOPE_INVALID' } });
    await expect(
      service.createDepositPolicy('ag1', {
        ...VALID_DEPOSIT,
        scopes: [
          { vehicleId: 'v-1', categoryId: null },
          { vehicleId: 'v-1', categoryId: null },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSIT_POLICY_SCOPE_INVALID' } });
    await expect(
      service.createDepositPolicy('ag1', {
        ...VALID_DEPOSIT,
        scopes: [{ vehicleId: 'ghost', categoryId: null }],
      }),
    ).rejects.toMatchObject({ response: { code: 'VEHICLE_NOT_FOUND' } });
    await expect(
      service.createDepositPolicy('ag1', {
        ...VALID_DEPOSIT,
        scopes: [{ vehicleId: null, categoryId: 'ghost' }],
      }),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_NOT_FOUND' } });
  });

  it('updates with PATCH merge and replaces scopes only when provided', async () => {
    const { service, commercial } = makeService({
      commercial: {
        findDepositPolicy: jest.fn((_tenantId: string, id: string) =>
          Promise.resolve(id === 'dep-1' ? depositRow() : null),
        ),
        updateDepositPolicy: jest.fn(() => Promise.resolve(depositRow({ active: false }))),
      },
      availability: {
        findVehicleInTenant: jest.fn(() =>
          Promise.resolve({ id: 'v-1', categoryId: 'cat-1', status: 'AVAILABLE', currentBranchId: null }),
        ),
      },
    });
    await expect(
      service.updateDepositPolicy('ag1', 'ghost', { active: false }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSIT_POLICY_NOT_FOUND' } });

    await service.updateDepositPolicy('ag1', 'dep-1', { valueMinor: 80_000 });
    expect(commercial.updateDepositPolicy as jest.Mock).toHaveBeenLastCalledWith(
      'ag1',
      'dep-1',
      expect.objectContaining({ name: 'Standard deposit', valueMinor: 80_000 }),
      undefined,
    );

    await service.updateDepositPolicy('ag1', 'dep-1', {
      scopes: [{ vehicleId: 'v-1', categoryId: null }],
    });
    expect(commercial.updateDepositPolicy as jest.Mock).toHaveBeenLastCalledWith(
      'ag1',
      'dep-1',
      expect.objectContaining({ valueMinor: 50_000 }),
      [{ vehicleId: 'v-1', categoryId: null }],
    );
  });
});
