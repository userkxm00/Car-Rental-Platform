import { Prisma } from '@prisma/client';
import { AvailabilityService } from '../../availability/application/availability.service';
import type { AvailabilityRepository } from '../../availability/infrastructure/availability.repository';
import { RatePlansService } from './rate-plans.service';
import type { RatePlanRow, RatePlansRepository } from '../infrastructure/rate-plans.repository';

/**
 * 06-A07 service tests over a fake repository and the REAL availability
 * service (scope target validation is tenant-scoped): boundary validation
 * matrix (06-A01…A06), uniqueness mapping, PATCH merge semantics and
 * deactivation.
 */

function makeAvailabilityRepository(
  overrides: Partial<AvailabilityRepository> = {},
): AvailabilityRepository {
  return {
    findVehicleInTenant: jest.fn(() =>  Promise.resolve(null)),
    findCategoryInTenant: jest.fn(() =>  Promise.resolve(null)),
    findConflictingBlocks: jest.fn(() =>  Promise.resolve([])),
    findConflictingHolds: jest.fn(() =>  Promise.resolve([])),
    listAvailable: jest.fn(() =>  Promise.resolve([])),
    countEligible: jest.fn(() =>  Promise.resolve(0)),
    countCommitted: jest.fn(() =>  Promise.resolve(0)),
    scheduleCommitments: jest.fn(() =>  Promise.resolve([])),
    ...overrides,
  } as unknown as AvailabilityRepository;
}

function planRow(overrides: Partial<RatePlanRow> = {}): RatePlanRow {
  return {
    id: 'p1',
    tenantId: 'ag1',
    code: 'BASE',
    name: 'Base rate',
    currency: 'DZD',
    durationUnit: 'DAILY',
    baseRateMinor: 5000,
    precedence: 0,
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
    effectiveUntil: null,
    active: true,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    scopes: [],
    tiers: [],
    adjustments: [],
    ...overrides,
  };
}

function makeService(options: {
  repository?: Partial<RatePlansRepository>;
  availabilityRepository?: Partial<AvailabilityRepository>;
} = {}) {
  const repository = {
    create: jest.fn(
      (input: {
        code: string;
        scopes: RatePlanRow['scopes'];
        tiers: RatePlanRow['tiers'];
        adjustments: RatePlanRow['adjustments'];
      }) =>
        Promise.resolve(
          planRow({
            code: input.code,
            scopes: input.scopes,
            tiers: input.tiers,
            adjustments: input.adjustments,
          }),
        ),
    ),
    findInTenant: jest.fn(() =>  Promise.resolve(planRow())),
    listInTenant: jest.fn(() =>  Promise.resolve([planRow()])),
    listActiveCandidates: jest.fn(() =>  Promise.resolve([planRow()])),
    update: jest.fn(() =>  Promise.resolve(planRow())),
    ...options.repository,
  } as unknown as RatePlansRepository;
  const availability = new AvailabilityService(
    makeAvailabilityRepository(options.availabilityRepository),
  );
  const service = new RatePlansService(repository, availability);
  return { repository, service };
}

const validInput = () => ({
  code: 'BASE',
  name: 'Base rate',
  currency: 'DZD',
  durationUnit: 'DAILY',
  baseRateMinor: 5000,
  precedence: 0,
  effectiveFrom: '2026-08-01T00:00:00Z',
});

describe('RatePlansService (06-A01…A07)', () => {
  it('creates a rate plan with validated fields and scopes', async () => {
    const { repository, service } = makeService({
      availabilityRepository: {
        findVehicleInTenant: jest.fn(() =>  Promise.resolve(({ id: 'v1', categoryId: 'c1', status: 'AVAILABLE', currentBranchId: null }))),
        findCategoryInTenant: jest.fn(() =>  Promise.resolve(({ id: 'c1', active: true }))),
      },
    });
    const result = await service.createRatePlan('ag1', {
      ...validInput(),
      scopes: [{ vehicleId: 'v1' }, { categoryId: 'c1' }],
    });
    expect(result.code).toBe('BASE');
    expect(result.baseRateMinor).toBe(5000);
    expect(result.scopes).toEqual([
      { vehicleId: 'v1', categoryId: null },
      { vehicleId: null, categoryId: 'c1' },
    ]);
    expect(repository.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'ag1', code: 'BASE', currency: 'DZD' }),
    );
  });

  it('rejects the boundary violation matrix with stable codes', async () => {
    const { service } = makeService();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...validInput(), code: 'x' }, 'RATE_PLAN_CODE_INVALID'],
      [{ ...validInput(), code: 'BAD CODE!' }, 'RATE_PLAN_CODE_INVALID'],
      [{ ...validInput(), name: '' }, 'RATE_PLAN_NAME_INVALID'],
      [{ ...validInput(), currency: 'BTC' }, 'RATE_PLAN_CURRENCY_UNSUPPORTED'],
      [{ ...validInput(), durationUnit: 'FORTNIGHT' }, 'RATE_PLAN_UNIT_INVALID'],
      [{ ...validInput(), baseRateMinor: 1.5 }, 'RATE_PLAN_RATE_INVALID'],
      [{ ...validInput(), baseRateMinor: -1 }, 'RATE_PLAN_RATE_INVALID'],
      [{ ...validInput(), baseRateMinor: 1_000_000_001 }, 'RATE_PLAN_RATE_INVALID'],
      [{ ...validInput(), precedence: -1 }, 'RATE_PLAN_PRECEDENCE_INVALID'],
      [{ ...validInput(), effectiveFrom: 'not-a-date' }, 'RATE_PLAN_WINDOW_INVALID'],
      [{ ...validInput(), effectiveUntil: '2026-07-01T00:00:00Z' }, 'RATE_PLAN_WINDOW_INVALID'],
      [{ ...validInput(), scopes: [{}] }, 'RATE_PLAN_SCOPE_INVALID'],
      [
        { ...validInput(), scopes: [{ vehicleId: 'v1', categoryId: 'c1' }] },
        'RATE_PLAN_SCOPE_INVALID',
      ],
    ];
    for (const [input, code] of cases) {
      await expect(service.createRatePlan('ag1', input as never)).rejects.toMatchObject({
        response: { code },
      });
    }
  });

  it('rejects duplicate scope targets (06-A04)', async () => {
    const { service } = makeService({
      availabilityRepository: {
        findVehicleInTenant: jest.fn(() =>  Promise.resolve(({ id: 'v1', categoryId: 'c1', status: 'AVAILABLE', currentBranchId: null }))),
      },
    });
    await expect(
      service.createRatePlan('ag1', {
        ...validInput(),
        scopes: [{ vehicleId: 'v1' }, { vehicleId: 'v1' }],
      }),
    ).rejects.toMatchObject({ response: { code: 'RATE_PLAN_SCOPE_INVALID' } });
  });

  it('rejects scope targets outside the tenant and inactive categories (06-A04)', async () => {
    const { service } = makeService({
      availabilityRepository: {
        findVehicleInTenant: jest.fn(() =>  Promise.resolve(null)),
        findCategoryInTenant: jest.fn(() =>  Promise.resolve(({ id: 'c1', active: false }))),
      },
    });
    await expect(
      service.createRatePlan('ag1', { ...validInput(), scopes: [{ vehicleId: 'ghost' }] }),
    ).rejects.toMatchObject({ response: { code: 'VEHICLE_NOT_FOUND' } });
    await expect(
      service.createRatePlan('ag1', { ...validInput(), scopes: [{ categoryId: 'c1' }] }),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_INACTIVE' } });
  });

  it('maps a code collision (P2002) to RATE_PLAN_CODE_TAKEN', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = makeService({
      repository: { create: jest.fn(() => { throw error; }) },
    });
    await expect(service.createRatePlan('ag1', validInput())).rejects.toMatchObject({
      response: { code: 'RATE_PLAN_CODE_TAKEN' },
    });
  });

  it('gets and lists tenant-scoped plans', async () => {
    const { service } = makeService();
    const one = await service.getRatePlan('ag1', 'p1');
    expect(one.ratePlanId).toBe('p1');
    const all = await service.listRatePlans('ag1');
    expect(all).toHaveLength(1);
  });

  it('404s unknown plans', async () => {
    const { service } = makeService({ repository: { findInTenant: jest.fn(() =>  Promise.resolve(null)) } });
    await expect(service.getRatePlan('ag1', 'ghost')).rejects.toMatchObject({
      response: { code: 'RATE_PLAN_NOT_FOUND' },
    });
    await expect(service.updateRatePlan('ag1', 'ghost', { active: false })).rejects.toMatchObject({
      response: { code: 'RATE_PLAN_NOT_FOUND' },
    });
  });

  it('patches with merge semantics: omitted fields keep, null clears the window end, scopes replace', async () => {
    const current = planRow({
      effectiveUntil: new Date('2026-12-31T23:59:59Z'),
      scopes: [{ vehicleId: 'v1', categoryId: null }],
    });
    const { repository, service } = makeService({
      repository: { findInTenant: jest.fn(() =>  Promise.resolve(current)) },
    });
    await service.updateRatePlan('ag1', 'p1', { active: false, effectiveUntil: null });
    expect(repository.update as jest.Mock).toHaveBeenCalledWith(
      'ag1',
      'p1',
      expect.objectContaining({
        code: 'BASE',
        name: 'Base rate',
        active: false,
        effectiveUntil: null,
        baseRateMinor: 5000,
      }),
      undefined,
      undefined,
      undefined,
    );

    const { repository: repo2, service: service2 } = makeService({
      repository: { findInTenant: jest.fn(() =>  Promise.resolve(current)) },
      availabilityRepository: {
        findVehicleInTenant: jest.fn(() =>  Promise.resolve(({ id: 'v2', categoryId: 'c2', status: 'AVAILABLE', currentBranchId: null }))),
      },
    });
    await service2.updateRatePlan('ag1', 'p1', { scopes: [{ vehicleId: 'v2' }] });
    expect(repo2.update as jest.Mock).toHaveBeenCalledWith(
      'ag1',
      'p1',
      expect.anything(),
      [{ vehicleId: 'v2', categoryId: null }],
      undefined,
      undefined,
    );
  });

  it('re-validates the merged window on patch', async () => {
    const { service } = makeService();
    await expect(
      service.updateRatePlan('ag1', 'p1', { effectiveUntil: '2026-07-01T00:00:00Z' }),
    ).rejects.toMatchObject({ response: { code: 'RATE_PLAN_WINDOW_INVALID' } });
  });
});

describe('RatePlansService time rules (06-B05…B08)', () => {
  it('stores a validated duration ladder', async () => {
    const { repository, service } = makeService();
    const result = await service.createRatePlan('ag1', {
      ...validInput(),
      tiers: [
        { upToUnits: 3, rateMinor: 4200 },
        { upToUnits: null, rateMinor: 3600 },
      ],
    });
    expect(result.tiers).toEqual([
      { upToUnits: 3, rateMinor: 4200 },
      { upToUnits: null, rateMinor: 3600 },
    ]);
    expect(repository.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ tiers: expect.any(Array) }),
    );
  });

  it('rejects malformed tiers with stable codes', async () => {
    const { service } = makeService();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...validInput(), tiers: [{ upToUnits: 10001, rateMinor: 100 }] }, 'RATE_PLAN_TIER_INVALID'],
      [{ ...validInput(), tiers: [{ upToUnits: 1, rateMinor: 100 }] }, 'RATE_PLAN_TIER_INVALID'],
      [{ ...validInput(), tiers: [{ upToUnits: 2.5, rateMinor: 100 }] }, 'RATE_PLAN_TIER_INVALID'],
      [{ ...validInput(), tiers: [{ upToUnits: 5, rateMinor: -1 }] }, 'RATE_PLAN_TIER_INVALID'],
      [
        { ...validInput(), tiers: [{ upToUnits: 5, rateMinor: 100 }, { upToUnits: 5, rateMinor: 200 }] },
        'RATE_PLAN_TIER_DUPLICATE',
      ],
      [
        { ...validInput(), tiers: [{ upToUnits: 5, rateMinor: 100 }, { upToUnits: 3, rateMinor: 200 }] },
        'RATE_PLAN_TIER_ORDER_INVALID',
      ],
    ];
    for (const [input, code] of cases) {
      await expect(service.createRatePlan('ag1', input as never)).rejects.toMatchObject({
        response: { code },
      });
    }
  });

  it('stores validated time adjustments (seasonal, weekend, holiday, special date)', async () => {
    const { repository, service } = makeService();
    const result = await service.createRatePlan('ag1', {
      ...validInput(),
      adjustments: [
        {
          kind: 'SEASONAL',
          adjustmentType: 'PERCENT',
          windowStart: '2026-08-01T00:00:00Z',
          windowEnd: '2026-09-01T00:00:00Z',
          valueMinor: 2000,
          precedence: 1,
        },
        {
          kind: 'WEEKEND',
          adjustmentType: 'FLAT_PER_UNIT',
          daysOfWeek: [5, 6],
          valueMinor: 300,
          precedence: 1,
        },
        {
          kind: 'HOLIDAY',
          adjustmentType: 'FLAT_PER_UNIT',
          date: '2026-11-01',
          valueMinor: 500,
          precedence: 1,
        },
        {
          kind: 'SPECIAL_DATE',
          adjustmentType: 'PERCENT',
          date: '2026-11-01',
          valueMinor: 1500,
          precedence: 1,
        },
      ],
    });
    expect(result.adjustments).toHaveLength(4);
    expect(repository.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustments: expect.arrayContaining([
          expect.objectContaining({ kind: 'WEEKEND', daysOfWeek: [5, 6] }),
        ]),
      }),
    );
  });

  it('rejects malformed adjustments with stable codes', async () => {
    const { service } = makeService();
    const cases: Array<[Record<string, unknown>, string]> = [
      [
        { ...validInput(), adjustments: [{ kind: 'FULLMOON', adjustmentType: 'PERCENT', valueMinor: 100, precedence: 0 }] },
        'RATE_PLAN_ADJUSTMENT_INVALID',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'WEEKEND', adjustmentType: 'PERCENT', daysOfWeek: [5], valueMinor: 100, precedence: -1 }] },
        'RATE_PLAN_ADJUSTMENT_INVALID',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'SEASONAL', adjustmentType: 'PERCENT', valueMinor: 100, precedence: 0 }] },
        'RATE_PLAN_ADJUSTMENT_WINDOW_INVALID',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'SEASONAL', adjustmentType: 'PERCENT', windowStart: '2026-09-01T00:00:00Z', windowEnd: '2026-08-01T00:00:00Z', valueMinor: 100, precedence: 0 }] },
        'RATE_PLAN_ADJUSTMENT_WINDOW_INVALID',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'WEEKEND', adjustmentType: 'PERCENT', daysOfWeek: [], valueMinor: 100, precedence: 0 }] },
        'RATE_PLAN_ADJUSTMENT_INVALID',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'WEEKEND', adjustmentType: 'PERCENT', daysOfWeek: [9], valueMinor: 100, precedence: 0 }] },
        'RATE_PLAN_ADJUSTMENT_INVALID',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'HOLIDAY', adjustmentType: 'FLAT_PER_UNIT', date: '01/11/2026', valueMinor: 100, precedence: 0 }] },
        'RATE_PLAN_ADJUSTMENT_INVALID',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'WEEKEND', adjustmentType: 'PERCENT', daysOfWeek: [5], valueMinor: 100, precedence: 3 }, { kind: 'WEEKEND', adjustmentType: 'PERCENT', daysOfWeek: [6], valueMinor: 100, precedence: 3 }] },
        'RATE_PLAN_ADJUSTMENT_DUPLICATE',
      ],
      [
        { ...validInput(), adjustments: [{ kind: 'WEEKEND', adjustmentType: 'PERCENT', daysOfWeek: [5], valueMinor: 100_000_001, precedence: 0 }] },
        'RATE_PLAN_ADJUSTMENT_INVALID',
      ],
    ];
    for (const [input, code] of cases) {
      await expect(service.createRatePlan('ag1', input as never)).rejects.toMatchObject({
        response: { code },
      });
    }
  });

  it('patches tiers/adjustments with replacement semantics', async () => {
    const current = planRow({
      tiers: [{ upToUnits: null, rateMinor: 3600 }],
      adjustments: [],
    });
    const { repository, service } = makeService({
      repository: { findInTenant: jest.fn(() => Promise.resolve(current)) },
    });
    await service.updateRatePlan('ag1', 'p1', {
      tiers: [{ upToUnits: 5, rateMinor: 4000 }],
    });
    expect(repository.update as jest.Mock).toHaveBeenCalledWith(
      'ag1',
      'p1',
      expect.anything(),
      undefined,
      [{ upToUnits: 5, rateMinor: 4000 }],
      undefined,
    );
    // omitted tiers keep the current ladder
    await service.updateRatePlan('ag1', 'p1', { baseRateMinor: 7000 });
    expect(repository.update as jest.Mock).toHaveBeenCalledWith(
      'ag1',
      'p1',
      expect.anything(),
      undefined,
      undefined,
      undefined,
    );
  });
});
