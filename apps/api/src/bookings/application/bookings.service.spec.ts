import { ConflictException, NotFoundException } from '@nestjs/common';
import { loadEnvSchema } from '@kavriqo/config';
import { AvailabilityService } from '../../availability/application/availability.service';
import type { AvailabilityRepository } from '../../availability/infrastructure/availability.repository';
import type { LocationContextService } from '../../availability/application/location-context.service';
import { IntervalConflictError } from '../../availability/infrastructure/commitment-guard';
import { BookingsService } from './bookings.service';
import type { BookingsRepository, BookingWithHistory } from '../infrastructure/bookings.repository';
import { BookingErrorCode, formatBookingNumber } from '../domain/booking-rules';

/**
 * Booking aggregate logic tests (05-B03/B04/B05/B07): boundary validation,
 * server-side availability re-check, numbering, hold placement and history —
 * against fakes for persistence/locations and the REAL availability service
 * over a fake availability repository (the SQL/guard path is covered by
 * e2e).
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

function historyEntry(toStatus: string, reason: string, fromStatus: string | null = null) {
  return {
    id: `h-${toStatus}`,
    fromStatus: fromStatus as never,
    toStatus: toStatus as never,
    actorUserId: 'u1',
    reason,
    correlationId: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  };
}

function bookingRow(overrides: Partial<BookingWithHistory> = {}): BookingWithHistory {
  return {
    id: 'b1',
    tenantId: 'ag1',
    bookingNumber: 'BK-2026-000001',
    channel: 'AGENCY_WEB',
    inventoryMode: 'VEHICLE',
    status: 'DRAFT',
    customerId: null,
    createdBy: 'u1',
    quoteId: null,
    requestedCategoryId: null,
    assignedVehicleId: '11111111-1111-4111-8111-111111111111',
    pickupBranchId: null,
    returnBranchId: null,
    deliveryZoneId: null,
    startsAt: new Date('2026-09-10T08:00:00Z'),
    endsAt: new Date('2026-09-10T18:00:00Z'),
    currency: 'DZD',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    statusHistory: [historyEntry('DRAFT', 'booking.created')],
    ...overrides,
  };
}

function makeService(options: {
  availabilityRepository?: Partial<AvailabilityRepository>;
  repository?: BookingsRepository;
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
  const repository = (options.repository ?? {}) as BookingsRepository;
  const service = new BookingsService(availability, locationContext, repository, env);
  return { service, repository };
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

describe('BookingsService.validateBookingRequest (05-B03/B04)', () => {
  it('validates a vehicle request with the default channel', () => {
    const { service } = makeService();
    const request = service.validateBookingRequest(vehicleRequest());
    expect(request).toMatchObject({
      channel: 'AGENCY_WEB',
      mode: 'VEHICLE',
      vehicleId: '11111111-1111-4111-8111-111111111111',
      categoryId: null,
    });
  });

  it('rejects invalid intervals, past starts, ambiguous targets and channels', () => {
    const { service } = makeService();
    expect(() => service.validateBookingRequest({ vehicleId: 'x' })).toThrow(ConflictException);
    expect(() =>
      service.validateBookingRequest({ ...vehicleRequest(), start: FUTURE.end, end: FUTURE.start }),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateBookingRequest({
        ...vehicleRequest(),
        start: new Date(Date.now() - 3600_000).toISOString(),
      }),
    ).toThrow(ConflictException);
    expect(() => service.validateBookingRequest({ start: FUTURE.start, end: FUTURE.end })).toThrow(
      ConflictException,
    );
    expect(() =>
      service.validateBookingRequest({
        ...vehicleRequest(),
        categoryId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toThrow(ConflictException);
    expect(() => service.validateBookingRequest({ ...vehicleRequest(), channel: 'NOPE' })).toThrow(
      ConflictException,
    );
  });
});

describe('BookingsService.createBooking (05-B03/B04)', () => {
  it('creates a vehicle booking with DRAFT history when availability passes', async () => {
    const repository = {
      create: jest.fn(async () => bookingRow()),
    } as unknown as BookingsRepository;
    const { service } = makeService({
      repository,
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      },
    });

    const result = await service.createBooking('ag1', 'u1', vehicleRequest());

    expect(result).toMatchObject({
      bookingId: 'b1',
      bookingNumber: 'BK-2026-000001',
      status: 'DRAFT',
      inventoryMode: 'VEHICLE',
      statusHistory: [{ toStatus: 'DRAFT', reason: 'booking.created' }],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'ag1', mode: 'VEHICLE', channel: 'AGENCY_WEB' }),
    );
  });

  it('rejects unavailable vehicles with BOOKING_UNAVAILABLE and the reasons', async () => {
    const repository = { create: jest.fn() } as unknown as BookingsRepository;
    const { service } = makeService({
      repository,
      availabilityRepository: {
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
        findConflictingBlocks: jest
          .fn()
          .mockResolvedValue([{ id: 'b1', blockType: 'MAINTENANCE' }]),
      },
    });

    try {
      await service.createBooking('ag1', 'u1', vehicleRequest());
      throw new Error('expected BOOKING_UNAVAILABLE');
    } catch (error) {
      const response = (error as { response?: { code?: string; reasons?: unknown[] } }).response;
      expect(response?.code).toBe(BookingErrorCode.BOOKING_UNAVAILABLE);
      expect(response?.reasons).toEqual([expect.objectContaining({ blockType: 'MAINTENANCE' })]);
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects category bookings without remaining capacity', async () => {
    const repository = { create: jest.fn() } as unknown as BookingsRepository;
    const { service } = makeService({
      repository,
      availabilityRepository: {
        findCategoryInTenant: jest.fn().mockResolvedValue({ id: 'c1', active: true }),
        countEligible: jest.fn().mockResolvedValue(1),
        countCommitted: jest.fn().mockResolvedValue(1),
      },
    });

    expect.assertions(1);
    try {
      await service.createBooking('ag1', 'u1', {
        categoryId: '22222222-2222-4222-8222-222222222222',
        start: FUTURE.start,
        end: FUTURE.end,
      });
    } catch (error) {
      expect((error as { response?: { code?: string } }).response?.code).toBe(
        BookingErrorCode.BOOKING_UNAVAILABLE,
      );
    }
  });

  it('creates category bookings with capacity and no vehicle assignment', async () => {
    const repository = {
      create: jest.fn(async () =>
        bookingRow({ inventoryMode: 'CATEGORY', assignedVehicleId: null, requestedCategoryId: 'c1' }),
      ),
    } as unknown as BookingsRepository;
    const { service } = makeService({
      repository,
      availabilityRepository: {
        findCategoryInTenant: jest.fn().mockResolvedValue({ id: 'c1', active: true }),
        countEligible: jest.fn().mockResolvedValue(3),
        countCommitted: jest.fn().mockResolvedValue(1),
      },
    });

    const result = await service.createBooking('ag1', 'u1', {
      categoryId: '22222222-2222-4222-8222-222222222222',
      start: FUTURE.start,
      end: FUTURE.end,
    });
    expect(result).toMatchObject({ inventoryMode: 'CATEGORY', assignedVehicleId: null });
  });

  it('rejects categories outside the tenant or inactive', async () => {
    const missing = makeService({
      availabilityRepository: { findCategoryInTenant: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      missing.service.createBooking('ag1', 'u1', {
        categoryId: '22222222-2222-4222-8222-222222222222',
        start: FUTURE.start,
        end: FUTURE.end,
      }),
    ).rejects.toMatchObject({ response: { code: BookingErrorCode.CATEGORY_NOT_FOUND } });

    const inactive = makeService({
      availabilityRepository: {
        findCategoryInTenant: jest.fn().mockResolvedValue({ id: 'c1', active: false }),
      },
    });
    await expect(
      inactive.service.createBooking('ag1', 'u1', {
        categoryId: '22222222-2222-4222-8222-222222222222',
        start: FUTURE.start,
        end: FUTURE.end,
      }),
    ).rejects.toMatchObject({ response: { code: BookingErrorCode.CATEGORY_INACTIVE } });
  });
});

describe('BookingsService.placeBookingHold (05-B05)', () => {
  it('places the hold through the repository and returns the HOLD state', async () => {
    const repository = {
      findInTenant: jest.fn(async () => bookingRow()),
      placeBookingHold: jest.fn(async () =>
        bookingRow({ status: 'HOLD', statusHistory: [historyEntry('HOLD', 'booking.hold_placed:x', 'DRAFT'), historyEntry('DRAFT', 'booking.created')] }),
      ),
    } as unknown as BookingsRepository;
    const { service } = makeService({ repository });

    const result = await service.placeBookingHold('ag1', 'u1', 'b1');

    expect(result.status).toBe('HOLD');
    expect(result.statusHistory[0]).toMatchObject({ toStatus: 'HOLD', fromStatus: 'DRAFT' });
    const call = (repository.placeBookingHold as jest.Mock).mock.calls[0][0] as {
      vehicleId: string;
      expiresAt: Date;
    };
    expect(call.vehicleId).toBe('11111111-1111-4111-8111-111111111111');
    expect(call.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(call.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
  });

  it('rejects holds on category bookings and non-DRAFT states', async () => {
    const categoryBooking = makeService({
      repository: {
        findInTenant: jest.fn(async () =>
          bookingRow({ inventoryMode: 'CATEGORY', assignedVehicleId: null }),
        ),
      } as unknown as BookingsRepository,
    });
    await expect(
      categoryBooking.service.placeBookingHold('ag1', 'u1', 'b1'),
    ).rejects.toMatchObject({ response: { code: BookingErrorCode.BOOKING_HOLD_UNSUPPORTED } });

    const heldBooking = makeService({
      repository: {
        findInTenant: jest.fn(async () => bookingRow({ status: 'HOLD' })),
      } as unknown as BookingsRepository,
    });
    await expect(heldBooking.service.placeBookingHold('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: BookingErrorCode.BOOKING_INVALID_TRANSITION },
    });
  });

  it('translates guard conflicts into INTERVAL_CONFLICT (04-B)', async () => {
    const repository = {
      findInTenant: jest.fn(async () => bookingRow()),
      placeBookingHold: jest.fn(async () => {
        throw new IntervalConflictError('conflict');
      }),
    } as unknown as BookingsRepository;
    const { service } = makeService({ repository });

    await expect(service.placeBookingHold('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: BookingErrorCode.INTERVAL_CONFLICT },
    });
  });
});

describe('BookingsService reads (05-B07)', () => {
  it('gets and lists tenant-scoped bookings with history', async () => {
    const repository = {
      findInTenant: jest.fn(async () => bookingRow()),
      listForTenant: jest.fn(async () => [bookingRow()]),
    } as unknown as BookingsRepository;
    const { service } = makeService({ repository });

    const one = await service.getBooking('ag1', 'b1');
    expect(one.bookingNumber).toBe('BK-2026-000001');

    const list = await service.listBookings('ag1');
    expect(list).toHaveLength(1);

    (repository.findInTenant as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.getBooking('ag1', 'b1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('formatBookingNumber (05-B02)', () => {
  it('formats BK-{year}-{six-digit sequence}', () => {
    expect(formatBookingNumber(1, new Date('2026-09-01T00:00:00Z'))).toBe('BK-2026-000001');
    expect(formatBookingNumber(42)).toMatch(/^BK-\d{4}-000042$/);
  });
});
