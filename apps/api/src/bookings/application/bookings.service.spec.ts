import { ConflictException, NotFoundException } from '@nestjs/common';
import { loadEnvSchema } from '@kavriqo/config';
import { AvailabilityService } from '../../availability/application/availability.service';
import type { AvailabilityRepository } from '../../availability/infrastructure/availability.repository';
import type { LocationContextService } from '../../availability/application/location-context.service';
import { IntervalConflictError } from '../../availability/infrastructure/commitment-guard';
import { BookingsService } from './bookings.service';
import type { BookingsRepository, BookingWithHistory } from '../infrastructure/bookings.repository';
import { ReplayedCommandError } from '../infrastructure/bookings.repository';
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
    resolve: jest.fn((_tenantId: string, input: Record<string, string | undefined>) => ({ ...input })),
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
      create: jest.fn(() => bookingRow()),
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
      null,
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
      create: jest.fn(() =>
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
      findInTenant: jest.fn(() => bookingRow()),
      placeBookingHold: jest.fn(() =>
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
        findInTenant: jest.fn(() =>
          bookingRow({ inventoryMode: 'CATEGORY', assignedVehicleId: null }),
        ),
      } as unknown as BookingsRepository,
    });
    await expect(
      categoryBooking.service.placeBookingHold('ag1', 'u1', 'b1'),
    ).rejects.toMatchObject({ response: { code: BookingErrorCode.BOOKING_HOLD_UNSUPPORTED } });

    const heldBooking = makeService({
      repository: {
        findInTenant: jest.fn(() => bookingRow({ status: 'HOLD' })),
      } as unknown as BookingsRepository,
    });
    await expect(heldBooking.service.placeBookingHold('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: BookingErrorCode.BOOKING_INVALID_TRANSITION },
    });
  });

  it('translates guard conflicts into INTERVAL_CONFLICT (04-B)', async () => {
    const repository = {
      findInTenant: jest.fn(() => bookingRow()),
      placeBookingHold: jest.fn(() => {
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
      findInTenant: jest.fn(() => bookingRow()),
      listForTenant: jest.fn(() => [bookingRow()]),
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

describe('BookingsService state machine commands (05-C01…C12)', () => {
  const transitionsRepo = (status: string, options: Partial<Record<string, unknown>> = {}) => {
    const repo = {
      findInTenant: jest.fn(() => bookingRow({ status: status as never })),
      applyTransition: jest.fn((input: { to: string; reason: string }) =>
        bookingRow({
          status: input.to as never,
          statusHistory: [
            historyEntry(input.to, input.reason, status as never),
            historyEntry('DRAFT', 'booking.created'),
          ],
        }),
      ),
      findActiveHold: jest.fn(() => ({ id: 'h1', vehicleId: '11111111-1111-4111-8111-111111111111', expiresAt: new Date(Date.now() + 3600_000), status: 'ACTIVE' })),
      updateBookingHold: jest.fn(() => undefined),
      cancelWithRecord: jest.fn(() => bookingRow({ status: 'CANCELLED' })),
      conflictingCommitmentsExcludingHold: jest.fn(() => []),
      findQuoteInTenant: jest.fn(() => ({ id: 'q1', vehicleId: '11111111-1111-4111-8111-111111111111', categoryId: null, expiresAt: new Date(Date.now() + 3600_000) })),
      findQuotePricing: jest.fn(() => ({ currency: 'DZD', totalMinor: 9000 })),
      capturePriceSnapshot: jest.fn(() => undefined),
      ...options,
    } as unknown as BookingsRepository;
    return { repo, ...makeService({ repository: repo }) };
  };

  it('requestConfirmation links the quote and moves DRAFT|HOLD → PENDING_CONFIRMATION (05-C01/C02)', async () => {
    for (const from of ['DRAFT', 'HOLD'] as const) {
      const { repo, service } = transitionsRepo(from);
      const result = await service.requestConfirmation('ag1', 'u1', 'b1', {
        customerId: 'user-1',
        quoteId: 'q1',
      });
      expect(result.status).toBe('PENDING_CONFIRMATION');
      expect((repo.applyTransition as jest.Mock).mock.calls[0][0]).toMatchObject({
        from,
        data: { customerId: 'user-1', quoteId: 'q1' },
      });
    }
  });

  it('rejects mismatched or expired quotes at requestConfirmation', async () => {
    const mismatched = transitionsRepo('HOLD', {
      findQuoteInTenant: jest.fn(() => ({ id: 'q1', vehicleId: '22222222-2222-4222-8222-222222222222', categoryId: null, expiresAt: new Date(Date.now() + 3600_000) })),
    });
    await expect(
      mismatched.service.requestConfirmation('ag1', 'u1', 'b1', { quoteId: 'q1' }),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_QUOTE_MISMATCH' } });

    const expired = transitionsRepo('HOLD', {
      findQuoteInTenant: jest.fn(() => ({ id: 'q1', vehicleId: '11111111-1111-4111-8111-111111111111', categoryId: null, expiresAt: new Date(Date.now() - 1000) })),
    });
    await expect(
      expired.service.requestConfirmation('ag1', 'u1', 'b1', { quoteId: 'q1' }),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_QUOTE_MISMATCH' } });
  });

  it('confirm requires the customer, refreshes the hold and captures the snapshot (05-C03)', async () => {
    const { repo, service } = transitionsRepo('PENDING_CONFIRMATION', {
      findInTenant: jest.fn(() => bookingRow({ status: 'PENDING_CONFIRMATION', customerId: 'user-1', quoteId: 'q1' })),
    });

    const result = await service.confirmBooking('ag1', 'u1', 'b1');

    expect(result.status).toBe('CONFIRMED');
    expect(repo.updateBookingHold).toHaveBeenCalledWith(
      expect.objectContaining({
        holdId: 'h1',
        status: 'ACTIVE',
        expiresAt: expect.any(Date),
      }),
    );
    expect(repo.capturePriceSnapshot).toHaveBeenCalledWith('b1', { currency: 'DZD', totalMinor: 9000 });

    const noCustomer = transitionsRepo('PENDING_CONFIRMATION');
    await expect(noCustomer.service.confirmBooking('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: 'BOOKING_CUSTOMER_REQUIRED' },
    });
  });

  it('confirm re-checks the interval and rejects when a new conflict appeared (05-C03)', async () => {
    const { service } = transitionsRepo('PENDING_CONFIRMATION', {
      findInTenant: jest.fn(() => bookingRow({ status: 'PENDING_CONFIRMATION', customerId: 'user-1' })),
      conflictingCommitmentsExcludingHold: jest.fn(() => [{ id: 'other-hold', kind: 'HOLD' }]),
    });

    await expect(service.confirmBooking('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: 'INTERVAL_CONFLICT' },
    });
  });

  it('confirm rejects bookings without a live hold (05-C03)', async () => {
    const { service } = transitionsRepo('PENDING_CONFIRMATION', {
      findInTenant: jest.fn(() => bookingRow({ status: 'PENDING_CONFIRMATION', customerId: 'user-1' })),
      findActiveHold: jest.fn(() => null),
    });
    await expect(service.confirmBooking('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: 'BOOKING_HOLD_NOT_ACTIVE' },
    });
  });

  it('markReady requires an assigned vehicle (05-C05)', async () => {
    const unassigned = transitionsRepo('CONFIRMED', {
      findInTenant: jest.fn(() => bookingRow({ status: 'CONFIRMED', assignedVehicleId: null, inventoryMode: 'CATEGORY' })),
    });
    await expect(unassigned.service.markReady('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: 'BOOKING_ASSIGNMENT_REQUIRED' },
    });

    const { repo, service } = transitionsRepo('CONFIRMED');
    const result = await service.markReady('ag1', 'u1', 'b1');
    expect(result.status).toBe('READY_FOR_PICKUP');
    expect(repo.applyTransition).toHaveBeenCalledWith(expect.objectContaining({ from: 'CONFIRMED', to: 'READY_FOR_PICKUP' }));
  });

  it('checkOut consumes the hold and moves to ACTIVE (05-C06)', async () => {
    const { repo, service } = transitionsRepo('READY_FOR_PICKUP');
    const result = await service.checkOut('ag1', 'u1', 'b1');
    expect(result.status).toBe('ACTIVE');
    expect(repo.updateBookingHold).toHaveBeenCalledWith(
      expect.objectContaining({ holdId: 'h1', status: 'CONSUMED' }),
    );
  });

  it('walks RETURN_PENDING → RETURNED → SETTLEMENT_PENDING → COMPLETED (05-C07…C10)', async () => {
    let status = 'ACTIVE';
    for (const [command, expected] of [
      ['requestReturn', 'RETURN_PENDING'],
      ['completeReturn', 'RETURNED'],
      ['openSettlement', 'SETTLEMENT_PENDING'],
      ['complete', 'COMPLETED'],
    ] as const) {
      const { service } = transitionsRepo(status);
      const method =
        command === 'requestReturn'
          ? service.requestReturn.bind(service)
          : command === 'completeReturn'
            ? service.completeReturn.bind(service)
            : command === 'openSettlement'
              ? service.openSettlement.bind(service)
              : service.completeBooking.bind(service);
      const result = await method('ag1', 'u1', 'b1');
      expect(result.status).toBe(expected);
      status = expected;
    }
  });

  it('cancel releases the hold and requires a reason (05-C11)', async () => {
    const noReason = transitionsRepo('HOLD');
    await expect(noReason.service.cancelBooking('ag1', 'u1', 'b1', '')).rejects.toMatchObject({
      response: { code: 'BOOKING_REASON_REQUIRED' },
    });

    const { repo, service } = transitionsRepo('HOLD');
    const result = await service.cancelBooking('ag1', 'u1', 'b1', 'customer asked');
    expect(result.status).toBe('CANCELLED');
    expect(repo.updateBookingHold).toHaveBeenCalledWith(
      expect.objectContaining({ holdId: 'h1', status: 'RELEASED' }),
    );
    expect(repo.cancelWithRecord).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'HOLD', reason: 'customer asked', initiator: 'AGENCY' }),
    );
  });

  it('expire requires an actually-expired hold (05-C11)', async () => {
    const notExpired = transitionsRepo('HOLD');
    await expect(notExpired.service.expireBooking('ag1', 'u1', 'b1')).rejects.toMatchObject({
      response: { code: 'BOOKING_HOLD_NOT_EXPIRED' },
    });

    const { repo, service } = transitionsRepo('HOLD', {
      findActiveHold: jest.fn(() => ({ id: 'h1', vehicleId: '11111111-1111-4111-8111-111111111111', expiresAt: new Date(Date.now() - 1000), status: 'ACTIVE' })),
    });
    const result = await service.expireBooking('ag1', 'u1', 'b1');
    expect(result.status).toBe('EXPIRED');
    expect(repo.updateBookingHold).toHaveBeenCalledWith(
      expect.objectContaining({ holdId: 'h1', status: 'EXPIRED' }),
    );
  });

  it('marks no-shows from READY_FOR_PICKUP once pickup has passed (05-C11/D04)', async () => {
    const { service } = transitionsRepo('READY_FOR_PICKUP', {
      findInTenant: jest.fn(() =>
        bookingRow({
          status: 'READY_FOR_PICKUP',
          startsAt: new Date(Date.now() - 3600_000),
          endsAt: new Date(Date.now() + 3600_000),
        }),
      ),
    });
    const result = await service.markNoShow('ag1', 'u1', 'b1', 'did not arrive');
    expect(result.status).toBe('NO_SHOW');
  });

  it('rejects disallowed moves with BOOKING_INVALID_TRANSITION (05-C12)', async () => {
    const { service } = transitionsRepo('COMPLETED');
    await expect(service.cancelBooking('ag1', 'u1', 'b1', 'nope')).rejects.toMatchObject({
      response: { code: 'BOOKING_INVALID_TRANSITION' },
    });
  });
});

describe('BookingsService lifecycle operations (05-D01…D10)', () => {
  const availableVehicle = (vehicleId: string) => ({
    id: vehicleId,
    status: 'AVAILABLE',
    currentBranchId: null,
  });

  const lifecycleRepo = (
    status: string,
    options: Partial<Record<string, unknown>> = {},
    availabilityRepository: Partial<AvailabilityRepository> = {
      findVehicleInTenant: jest.fn().mockResolvedValue(availableVehicle('33333333-3333-4333-8333-333333333333')),
    },
  ) => {
    const repo = {
      findInTenant: jest.fn(() => bookingRow({ status: status as never })),
      findActiveHold: jest.fn(() => ({ id: 'h1', vehicleId: '11111111-1111-4111-8111-111111111111', expiresAt: new Date(Date.now() + 3600_000), status: 'ACTIVE' })),
      cancelWithRecord: jest.fn(() => bookingRow({ status: 'CANCELLED' })),
      createExtension: jest.fn((input: { requestedEndsAt: Date; originalEndsAt: Date }) => ({
        id: 'e1',
        status: 'REQUESTED',
        requestedEndsAt: input.requestedEndsAt,
        originalEndsAt: input.originalEndsAt,
      })),
      findExtensionInTenant: jest.fn((tenantId: string) => (tenantId === 'ag1' ? {
        id: 'e1',
        bookingId: 'b1',
        status: 'REQUESTED',
        originalEndsAt: new Date('2026-09-10T18:00:00Z'),
        requestedEndsAt: new Date('2026-09-11T18:00:00Z'),
        bookingEndsAt: new Date('2026-09-10T18:00:00Z'),
        bookingStatus: 'ACTIVE',
        inventoryMode: 'VEHICLE',
        assignedVehicleId: '11111111-1111-4111-8111-111111111111',
        requestedCategoryId: null,
      } : null)),
      findLatestExtension: jest.fn(() => ({
        id: 'e1',
        status: 'REQUESTED',
        requestedEndsAt: new Date('2026-09-11T18:00:00Z'),
        originalEndsAt: new Date('2026-09-10T18:00:00Z'),
      })),
      conflictingCommitmentsExcludingHold: jest.fn(() => []),
      approveExtension: jest.fn(() => undefined),
      rejectExtension: jest.fn(() => undefined),
      reassignVehicle: jest.fn(() => bookingRow({ status: status as never })),
      sweepExpiredHolds: jest.fn(() => 2),
      findIdempotencyRecord: jest.fn(() => null),
      applyTransition: jest.fn((input: { to: string }) => bookingRow({ status: input.to as never })),
      placeBookingHold: jest.fn(() => bookingRow({ status: 'HOLD' })),
      create: jest.fn(() => bookingRow({ status: 'DRAFT' })),
      findQuoteInTenant: jest.fn(() => null),
      findQuotePricing: jest.fn(() => null),
      capturePriceSnapshot: jest.fn(() => undefined),
      updateBookingHold: jest.fn(() => undefined),
      ...options,
    } as unknown as BookingsRepository;
    return { repo, ...makeService({ repository: repo, availabilityRepository }) };
  };

  it('cancellation records the initiator and reason (05-D01/D02)', async () => {
    const { repo, service } = lifecycleRepo('HOLD');
    const result = await service.cancelBooking('ag1', 'u1', 'b1', 'changed mind', 'CUSTOMER');
    expect(result.status).toBe('CANCELLED');
    expect(repo.cancelWithRecord).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1', from: 'HOLD', reason: 'changed mind', initiator: 'CUSTOMER' }),
    );
  });

  it('no-show requires the pickup instant to have passed (05-D04)', async () => {
    const before = lifecycleRepo('READY_FOR_PICKUP', {
      findInTenant: jest.fn(() =>
        bookingRow({
          status: 'READY_FOR_PICKUP',
          startsAt: new Date(Date.now() + 3600_000),
          endsAt: new Date(Date.now() + 7200_000),
        }),
      ),
    });
    await expect(
      before.service.markNoShow('ag1', 'u1', 'b1', 'did not arrive'),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_INVALID_TRANSITION' } });

    const after = lifecycleRepo('READY_FOR_PICKUP', {
      findInTenant: jest.fn(() =>
        bookingRow({
          status: 'READY_FOR_PICKUP',
          startsAt: new Date(Date.now() - 3600_000),
          endsAt: new Date(Date.now() + 3600_000),
        }),
      ),
    });
    const result = await after.service.markNoShow('ag1', 'u1', 'b1', 'did not arrive');
    expect(result.status).toBe('NO_SHOW');
  });

  it('requests extensions with an availability re-check and idempotency (05-D05/D06/D09)', async () => {
    const booking = bookingRow({
      status: 'ACTIVE',
      startsAt: new Date('2026-09-10T08:00:00Z'),
      endsAt: new Date('2026-09-10T18:00:00Z'),
    });
    const { repo, service } = lifecycleRepo('ACTIVE', { findInTenant: jest.fn(() => booking) });

    const result = await service.requestExtension('ag1', 'u1', 'b1', {
      end: '2026-09-11T18:00:00Z',
      reason: 'keep the car',
    }, 'key-1');
    expect(result).toMatchObject({ extensionId: 'e1', status: 'REQUESTED' });
    expect(repo.createExtension).toHaveBeenCalledWith(
      expect.objectContaining({ originalEndsAt: booking.endsAt }),
      expect.objectContaining({ command: 'booking.extend', idempotencyKey: 'key-1' }),
    );

    // Invalid end and conflicts are stable 409s.
    const invalid = lifecycleRepo('ACTIVE', { findInTenant: jest.fn(() => booking) });
    await expect(
      invalid.service.requestExtension('ag1', 'u1', 'b1', { end: '2026-09-10T10:00:00Z' }),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_EXTENSION_END_INVALID' } });

    const conflicting = lifecycleRepo('ACTIVE', {
      findInTenant: jest.fn(() => booking),
      conflictingCommitmentsExcludingHold: jest.fn(() => [{ id: 'x', kind: 'HOLD' }]),
    });
    await expect(
      conflicting.service.requestExtension('ag1', 'u1', 'b1', { end: '2026-09-11T18:00:00Z' }),
    ).rejects.toMatchObject({ response: { code: 'INTERVAL_CONFLICT' } });
  });

  it('approves and rejects extensions with state checks (05-D06)', async () => {
    const { repo, service } = lifecycleRepo('ACTIVE');
    await service.approveExtension('ag1', 'u1', 'e1');
    expect(repo.approveExtension).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1', extensionId: 'e1', newEndsAt: expect.any(Date) }),
    );

    const decided = lifecycleRepo('ACTIVE', {
      findExtensionInTenant: jest.fn(() => ({
        id: 'e1',
        bookingId: 'b1',
        status: 'APPROVED',
        originalEndsAt: new Date('2026-09-10T18:00:00Z'),
        requestedEndsAt: new Date('2026-09-11T18:00:00Z'),
        bookingEndsAt: new Date('2026-09-10T18:00:00Z'),
        bookingStatus: 'ACTIVE',
        inventoryMode: 'VEHICLE',
        assignedVehicleId: '11111111-1111-4111-8111-111111111111',
        requestedCategoryId: null,
      })),
    });
    await expect(decided.service.approveExtension('ag1', 'u1', 'e1')).rejects.toMatchObject({
      response: { code: 'BOOKING_EXTENSION_NOT_PENDING' },
    });

    const noReason = lifecycleRepo('ACTIVE');
    await expect(noReason.service.rejectExtension('ag1', 'u1', 'e1', '')).rejects.toMatchObject({
      response: { code: 'BOOKING_REASON_REQUIRED' },
    });
    const { repo: rejectRepo, service: rejectService } = lifecycleRepo('ACTIVE');
    const rejected = await rejectService.rejectExtension('ag1', 'u1', 'e1', 'fleet needs it');
    expect(rejected).toEqual({ extensionId: 'e1', status: 'REJECTED' });
    expect(rejectRepo.rejectExtension).toHaveBeenCalledWith(
      expect.objectContaining({ extensionId: 'e1', reason: 'fleet needs it' }),
    );
  });

  it('reassigns vehicles before the rental with the hold move (05-D07)', async () => {
    const { repo, service } = lifecycleRepo('HOLD');
    const result = await service.reassignVehicle('ag1', 'u1', 'b1', {
      vehicleId: '33333333-3333-4333-8333-333333333333',
      reason: 'swap',
    });
    expect(result.status).toBe('HOLD');
    expect(repo.reassignVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'ag1',
        bookingId: 'b1',
        fromVehicleId: '11111111-1111-4111-8111-111111111111',
        toVehicleId: '33333333-3333-4333-8333-333333333333',
        fromStatus: 'HOLD',
      }),
    );

    const sameVehicle = lifecycleRepo('HOLD');
    await expect(
      sameVehicle.service.reassignVehicle('ag1', 'u1', 'b1', {
        vehicleId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_INVALID_TRANSITION' } });
  });

  it('sweeps expired holds (05-D03)', async () => {
    const { repo, service } = lifecycleRepo('HOLD');
    const result = await service.expireStaleHoldSweep('ag1', 'u1');
    expect(result).toEqual({ expired: 2 });
    expect(repo.sweepExpiredHolds).toHaveBeenCalledWith('ag1');
  });

  it('replays idempotent commands with the original result (05-D09)', async () => {
    const replayed = new ReplayedCommandError('b1');
    const { service } = lifecycleRepo(
      'HOLD',
      {
        create: jest.fn(() => {
          throw replayed;
        }),
        findIdempotencyRecord: jest.fn(() => ({ bookingId: 'b1' })),
      },
      {
        findVehicleInTenant: jest.fn().mockResolvedValue(availableVehicle('11111111-1111-4111-8111-111111111111')),
      },
    );

    const result = await service.createBooking(
      'ag1',
      'u1',
      vehicleRequest(),
      'same-key',
    );
    expect(result.bookingId).toBe('b1');
  });
});
