import { ConflictException, NotFoundException } from '@nestjs/common';
import { loadEnvSchema } from '@kavriqo/config';
import { AvailabilityService } from '../../availability/application/availability.service';
import type { AvailabilityRepository } from '../../availability/infrastructure/availability.repository';
import type { LocationContextService } from '../../availability/application/location-context.service';
import { QuotesService } from './quotes.service';
import type { QuotesRepository, QuoteRecordRow } from '../infrastructure/quotes.repository';
import {
  QUOTE_PRICING_NOT_CONFIGURED_CODE,
  type QuotePricingPort,
} from './ports/quote-pricing.port';
import { QuoteErrorCode } from '../domain/quote-contract';

/**
 * Quote/request logic tests (05-A01…A05): boundary validation, eligibility,
 * availability integration, the pricing boundary and expiry — against fakes
 * for persistence/locations and the REAL availability service over a fake
 * availability repository (the SQL itself is covered by e2e).
 */

function makeAvailabilityRepository(
  overrides: Partial<AvailabilityRepository> = {},
): AvailabilityRepository {
  return {
    findVehicleInTenant: jest.fn(),
    findCategoryInTenant: jest.fn(),
    findConflictingBlocks: jest.fn().mockResolvedValue([]),
    findConflictingHolds: jest.fn().mockResolvedValue([]),
    listAvailable: jest.fn().mockResolvedValue([]),
    countEligible: jest.fn().mockResolvedValue(0),
    countCommitted: jest.fn().mockResolvedValue(0),
    scheduleCommitments: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AvailabilityRepository;
}

function makeQuotesRepository(): QuotesRepository & { rows: QuoteRecordRow[] } {
  const rows: QuoteRecordRow[] = [];
  return {
    rows,
    create: jest.fn(async (input) => {
      const row: QuoteRecordRow = {
        id: 'q1',
        tenantId: input.tenantId,
        channel: input.request.channel,
        inventoryMode: input.request.mode,
        vehicleId: input.request.vehicleId,
        categoryId: input.request.categoryId,
        pickupBranchId: input.request.pickupBranchId,
        returnBranchId: input.request.returnBranchId,
        deliveryZoneId: input.request.deliveryZoneId,
        startsAt: input.request.start,
        endsAt: input.request.end,
        expiresAt: input.expiresAt,
        availabilityJson: input.availability,
        pricingJson: input.pricing,
        createdBy: input.createdBy,
        createdAt: new Date(),
      };
      rows.push(row);
      return row;
    }),
    findInTenant: jest.fn(
      async (tenantId, quoteId) => rows.find((r) => r.tenantId === tenantId && r.id === quoteId) ?? null,
    ),
  } as unknown as QuotesRepository & { rows: QuoteRecordRow[] };
}

function makeService(options: {
  availabilityRepository?: Partial<AvailabilityRepository>;
  repository?: QuotesRepository;
  pricing?: QuotePricingPort;
} = {}) {
  const availability = new AvailabilityService(makeAvailabilityRepository(options.availabilityRepository));
  const locationContext = {
    resolve: jest.fn(async (_tenantId: string, input: Record<string, string | undefined>) => ({ ...input })),
  } as unknown as LocationContextService;
  const env = loadEnvSchema({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental',
    SUPABASE_JWT_ISSUER: 'http://127.0.0.1:5433/auth/v1',
    SUPABASE_JWKS_URL: 'http://127.0.0.1:5433/auth/v1/.well-known/jwks.json',
  });
  const service = new QuotesService(
    availability,
    locationContext,
    options.repository ?? makeQuotesRepository(),
    env,
    options.pricing,
  );
  return { service, locationContext };
}

const FUTURE = {
  start: new Date(Date.now() + 24 * 3600_000).toISOString(),
  end: new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString(),
};

const vehicleRequest = () => ({
  vehicleId: '11111111-1111-4111-8111-111111111111',
  start: FUTURE.start,
  end: FUTURE.end,
});

describe('QuotesService.validateRequest (05-A01/A02)', () => {
  it('validates a vehicle request with the default channel and normalized instants', () => {
    const { service } = makeService();
    const input = vehicleRequest();
    input.start = '2026-09-10T09:00:00+01:00';
    input.end = '2026-09-10T18:00:00Z';

    const request = service.validateRequest(input);

    expect(request).toMatchObject({
      channel: 'AGENCY_WEB',
      mode: 'VEHICLE',
      vehicleId: input.vehicleId,
      categoryId: null,
      pickupBranchId: null,
      returnBranchId: null,
      deliveryZoneId: null,
    });
    expect(request.start.toISOString()).toBe('2026-09-10T08:00:00.000Z');
  });

  it('rejects missing, inverted and zone-less intervals', () => {
    const { service } = makeService();
    expect(() => service.validateRequest({ vehicleId: 'x' })).toThrow(ConflictException);
    expect(() =>
      service.validateRequest({ ...vehicleRequest(), start: FUTURE.end, end: FUTURE.start }),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateRequest({
        ...vehicleRequest(),
        start: '2026-09-10T08:00:00',
        end: '2026-09-10T18:00:00',
      }),
    ).toThrow(ConflictException);
  });

  it('rejects quotes that start in the past (05-A02)', () => {
    const { service } = makeService();
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect.assertions(1);
    try {
      service.validateRequest({ ...vehicleRequest(), start: past });
    } catch (error) {
      expect((error as { response?: { code?: string } }).response?.code).toBe(
        QuoteErrorCode.INTERVAL_IN_PAST,
      );
    }
  });

  it('requires exactly one inventory target (05-A02)', () => {
    const { service } = makeService();
    expect.assertions(2);
    try {
      service.validateRequest({ start: FUTURE.start, end: FUTURE.end });
    } catch (error) {
      expect((error as { response?: { code?: string } }).response?.code).toBe(
        QuoteErrorCode.QUOTE_TARGET_REQUIRED,
      );
    }
    try {
      service.validateRequest({
        ...vehicleRequest(),
        categoryId: '22222222-2222-4222-8222-222222222222',
      });
    } catch (error) {
      expect((error as { response?: { code?: string } }).response?.code).toBe(
        QuoteErrorCode.QUOTE_TARGET_EXCLUSIVE,
      );
    }
  });

  it('rejects unknown channels', () => {
    const { service } = makeService();
    expect.assertions(1);
    try {
      service.validateRequest({ ...vehicleRequest(), channel: 'CARRIER_PIGEON' });
    } catch (error) {
      expect((error as { response?: { code?: string } }).response?.code).toBe(
        QuoteErrorCode.INVALID_CHANNEL,
      );
    }
  });
});

describe('QuotesService.createQuote (05-A03/A04/A05)', () => {
  it('creates a vehicle quote with the computed availability and null pricing without a provider', async () => {
    const repository = makeQuotesRepository();
    const { service } = makeService({
      repository,
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      },
    });

    const result = await service.createQuote('ag1', 'u1', vehicleRequest());

    expect(result).toMatchObject({
      quoteId: 'q1',
      channel: 'AGENCY_WEB',
      expired: false,
      request: { mode: 'VEHICLE' },
      availability: { mode: 'VEHICLE', available: true, reasons: [] },
      pricing: null,
    });
    expect(new Date(result.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(new Date(result.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect(repository.rows).toHaveLength(1);
  });

  it('reports unavailable vehicles with structured reasons instead of failing', async () => {
    const { service } = makeService({
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
        findConflictingBlocks: jest
          .fn()
          .mockResolvedValue([{ id: 'b1', blockType: 'MAINTENANCE' }]),
      },
    });

    const result = await service.createQuote('ag1', 'u1', vehicleRequest());

    expect(result.availability).toMatchObject({
      mode: 'VEHICLE',
      available: false,
      reasons: [{ code: 'BLOCK_CONFLICT', blockType: 'MAINTENANCE' }],
    });
  });

  it('fills the pricing slot through the port when a provider is registered (05-A04)', async () => {
    const pricing: QuotePricingPort = {
      computeQuotePricing: jest.fn().mockResolvedValue({
        currency: 'DZD',
        totalMinor: 120000,
        breakdown: [{ code: 'BASE_RATE', amountMinor: 120000 }],
        depositMinor: null,
        calculatedAt: '2026-09-01T00:00:00.000Z',
      }),
    };
    const { service } = makeService({
      pricing,
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      },
    });

    const result = await service.createQuote('ag1', 'u1', vehicleRequest());

    expect(result.pricing).toMatchObject({ currency: 'DZD', totalMinor: 120000 });
    expect(pricing.computeQuotePricing).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'ag1', mode: 'VEHICLE' }),
    );
  });

  it('keeps pricing null when the engine reports no pricing configuration (06-D06)', async () => {
    const pricing: QuotePricingPort = {
      computeQuotePricing: jest.fn().mockRejectedValue(
        new ConflictException({
          code: QUOTE_PRICING_NOT_CONFIGURED_CODE,
          message: 'No active rate plan applies to this quote.',
        }),
      ),
    };
    const { service } = makeService({
      pricing,
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      },
    });

    const result = await service.createQuote('ag1', 'u1', vehicleRequest());
    expect(result.pricing).toBeNull();
  });

  it('propagates non-pricing engine errors (06-D06)', async () => {
    const pricing: QuotePricingPort = {
      computeQuotePricing: jest
        .fn()
        .mockRejectedValue(new Error('engine exploded')),
    };
    const { service } = makeService({
      pricing,
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      },
    });

    await expect(service.createQuote('ag1', 'u1', vehicleRequest())).rejects.toThrow(
      'engine exploded',
    );
  });

  it('creates a category quote from the capacity answer (05-A03)', async () => {
    const { service } = makeService({
      availabilityRepository: {
        findCategoryInTenant: jest.fn().mockResolvedValue({ id: 'c1', active: true }),
        countEligible: jest.fn().mockResolvedValue(4),
        countCommitted: jest.fn().mockResolvedValue(2),
      },
    });

    const result = await service.createQuote('ag1', 'u1', {
      categoryId: '22222222-2222-4222-8222-222222222222',
      start: FUTURE.start,
      end: FUTURE.end,
    });

    expect(result.availability).toMatchObject({
      mode: 'CATEGORY',
      eligible: 4,
      committed: 2,
      availableCount: 2,
    });
  });

  it('rejects categories outside the tenant or inactive (05-A02)', async () => {
    const missing = makeService({
      availabilityRepository: { findCategoryInTenant: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      missing.service.createQuote('ag1', 'u1', {
        categoryId: '22222222-2222-4222-8222-222222222222',
        start: FUTURE.start,
        end: FUTURE.end,
      }),
    ).rejects.toMatchObject({ response: { code: QuoteErrorCode.CATEGORY_NOT_FOUND } });

    const inactive = makeService({
      availabilityRepository: {
        findCategoryInTenant: jest.fn().mockResolvedValue({ id: 'c1', active: false }),
      },
    });
    await expect(
      inactive.service.createQuote('ag1', 'u1', {
        categoryId: '22222222-2222-4222-8222-222222222222',
        start: FUTURE.start,
        end: FUTURE.end,
      }),
    ).rejects.toMatchObject({ response: { code: QuoteErrorCode.CATEGORY_INACTIVE } });
  });

  it('rejects vehicles outside the tenant (05-A02)', async () => {
    const { service } = makeService({
      availabilityRepository: { findVehicleInTenant: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.createQuote('ag1', 'u1', vehicleRequest())).rejects.toMatchObject({
      response: { code: QuoteErrorCode.VEHICLE_NOT_FOUND },
    });
  });
});

describe('QuotesService.getQuote (05-A05)', () => {
  it('flags expired quotes explicitly and hides other agencies records', async () => {
    const repository = makeQuotesRepository();
    const { service } = makeService({
      repository,
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      },
    });
    await service.createQuote('ag1', 'u1', vehicleRequest());

    const live = await service.getQuote('ag1', 'q1');
    expect(live.expired).toBe(false);

    repository.rows[0].expiresAt = new Date(Date.now() - 1000);
    const expired = await service.getQuote('ag1', 'q1');
    expect(expired.expired).toBe(true);
    expect(expired.pricing).toBeNull();

    await expect(service.getQuote('ag1', 'unknown')).rejects.toMatchObject({
      response: { code: QuoteErrorCode.QUOTE_NOT_FOUND },
    });
    await expect(service.getQuote('other-agency', 'q1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
