import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AppEnv } from '@kavriqo/config';
import { APP_ENV } from '../../config/app-env.token';
import { AvailabilityService } from '../../availability/application/availability.service';
import { LocationContextService } from '../../availability/application/location-context.service';
import { IntervalConflictError } from '../../availability/infrastructure/commitment-guard';
import {
  BOOKING_CHANNELS,
  BookingErrorCode,
  type BookingChannel,
  type BookingRequestInput,
  type ValidatedBookingRequest,
} from '../domain/booking-rules';
import { BookingsRepository, type BookingWithHistory } from '../infrastructure/bookings.repository';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | undefined, label: string): string | null {
  if (value === undefined || value === '') {
    return null;
  }
  if (!UUID_SHAPE.test(value)) {
    throw new ConflictException({
      code: BookingErrorCode.INVALID_INTERVAL,
      message: `${label} must be a valid identifier.`,
    });
  }
  return value;
}

/** Booking API response: the aggregate plus its append-only history. */
export interface BookingResponse {
  bookingId: string;
  bookingNumber: string;
  channel: BookingChannel;
  inventoryMode: 'VEHICLE' | 'CATEGORY';
  status: string;
  customerId: string | null;
  createdBy: string | null;
  quoteId: string | null;
  requestedCategoryId: string | null;
  assignedVehicleId: string | null;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
  start: string;
  end: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  statusHistory: Array<{
    historyId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: string | null;
    reason: string | null;
    correlationId: string | null;
    createdAt: string;
  }>;
}

/**
 * Booking aggregate use-cases (05-B03/B04/B05/B07).
 *
 * Creation re-checks availability server-side (docs/11): vehicle targets
 * must answer `available` and category targets need remaining capacity,
 * otherwise the request is rejected with a structured BOOKING_UNAVAILABLE
 * error. The booking starts DRAFT with an append-only history entry; the
 * inventory hold is placed explicitly (05-B05) through the 04-B commitment
 * guard, which re-checks under a per-vehicle lock. Status transitions
 * beyond DRAFT→HOLD are the state-machine commands of 05-C.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly locationContext: LocationContextService,
    private readonly repository: BookingsRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** 05-B03/04 boundary validation — mirrors the quote boundary (05-A). */
  validateBookingRequest(input: BookingRequestInput): ValidatedBookingRequest {
    const { start, end } = this.availability.validateRequestInterval(input.start, input.end);

    if (start.getTime() <= Date.now()) {
      throw new ConflictException({
        code: BookingErrorCode.INTERVAL_IN_PAST,
        message: 'Booking start must be in the future.',
      });
    }

    const vehicleId = optionalUuid(input.vehicleId, 'vehicleId');
    const categoryId = optionalUuid(input.categoryId, 'categoryId');
    if (vehicleId === null && categoryId === null) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_TARGET_REQUIRED,
        message: 'Exactly one of vehicleId or categoryId is required.',
      });
    }
    if (vehicleId !== null && categoryId !== null) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_TARGET_EXCLUSIVE,
        message: 'vehicleId and categoryId are mutually exclusive.',
      });
    }

    const channel = (input.channel ?? 'AGENCY_WEB') as BookingChannel;
    if (!(BOOKING_CHANNELS as readonly string[]).includes(channel)) {
      throw new ConflictException({
        code: BookingErrorCode.INVALID_CHANNEL,
        message: `channel must be one of ${BOOKING_CHANNELS.join(', ')}.`,
      });
    }

    return {
      channel,
      mode: vehicleId !== null ? 'VEHICLE' : 'CATEGORY',
      vehicleId,
      categoryId,
      start,
      end,
      pickupBranchId: optionalUuid(input.pickupBranchId, 'pickupBranchId'),
      returnBranchId: optionalUuid(input.returnBranchId, 'returnBranchId'),
      deliveryZoneId: optionalUuid(input.deliveryZoneId, 'deliveryZoneId'),
    };
  }

  /** 05-B03/B04: create the booking (DRAFT + history) in one transaction. */
  async createBooking(
    tenantId: string,
    createdBy: string | null,
    input: BookingRequestInput,
  ): Promise<BookingResponse> {
    const request = this.validateBookingRequest(input);

    const context = await this.locationContext.resolve(tenantId, {
      pickupBranchId: request.pickupBranchId ?? undefined,
      returnBranchId: request.returnBranchId ?? undefined,
      deliveryZoneId: request.deliveryZoneId ?? undefined,
    });

    await this.assertBookable(tenantId, request, context);

    const row = await this.repository.create({
      tenantId,
      createdBy,
      channel: request.channel,
      mode: request.mode,
      vehicleId: request.vehicleId,
      categoryId: request.categoryId,
      pickupBranchId: request.pickupBranchId,
      returnBranchId: request.returnBranchId,
      deliveryZoneId: request.deliveryZoneId,
      start: request.start,
      end: request.end,
    });
    return this.toResponse(row);
  }

  /** 05-B05: place the inventory hold for a DRAFT vehicle booking. */
  async placeBookingHold(
    tenantId: string,
    actorUserId: string | null,
    bookingId: string,
  ): Promise<BookingResponse> {
    const row = await this.repository.findInTenant(tenantId, bookingId);
    if (!row) {
      throw new NotFoundException({
        code: BookingErrorCode.BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    if (row.inventoryMode !== 'VEHICLE' || !row.assignedVehicleId) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_HOLD_UNSUPPORTED,
        message: 'Category bookings reserve capacity, not a vehicle interval.',
      });
    }
    if (row.status !== 'DRAFT') {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_INVALID_TRANSITION,
        message: `Cannot hold a booking in status ${row.status} — only DRAFT bookings can be held.`,
      });
    }

    const expiresAt = new Date(Date.now() + this.env.HOLD_TTL_MINUTES * 60_000);
    try {
      const updated = await this.repository.placeBookingHold({
        tenantId,
        bookingId,
        vehicleId: row.assignedVehicleId,
        channel: row.channel,
        start: row.startsAt,
        end: row.endsAt,
        expiresAt,
        createdBy: actorUserId,
      });
      return this.toResponse(updated);
    } catch (error) {
      if (error instanceof IntervalConflictError) {
        throw new ConflictException({
          code: BookingErrorCode.INTERVAL_CONFLICT,
          message: error.message,
        });
      }
      throw error;
    }
  }

  async getBooking(tenantId: string, bookingId: string): Promise<BookingResponse> {
    const row = await this.repository.findInTenant(tenantId, bookingId);
    if (!row) {
      throw new NotFoundException({
        code: BookingErrorCode.BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    return this.toResponse(row);
  }

  async listBookings(tenantId: string): Promise<BookingResponse[]> {
    const rows = await this.repository.listForTenant(tenantId);
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * 05-B03/04: server-side availability re-check at creation (docs/11).
   * A quote may describe an unavailable offer; a booking may not be created
   * for one.
   */
  private async assertBookable(
    tenantId: string,
    request: ValidatedBookingRequest,
    context: { pickupBranchId?: string; returnBranchId?: string; deliveryZoneId?: string },
  ): Promise<void> {
    if (request.mode === 'VEHICLE') {
      const result = await this.availability.vehicleAvailability(
        tenantId,
        request.vehicleId as string,
        { start: request.start, end: request.end },
        context,
      );
      if (!result.available) {
        throw new ConflictException({
          code: BookingErrorCode.BOOKING_UNAVAILABLE,
          message: 'Vehicle is not available for the requested interval.',
          reasons: result.reasons,
        });
      }
      return;
    }

    const category = await this.availability.findCategoryInTenant(
      tenantId,
      request.categoryId as string,
    );
    if (!category) {
      throw new NotFoundException({
        code: BookingErrorCode.CATEGORY_NOT_FOUND,
        message: 'Category not found in this agency.',
      });
    }
    if (!category.active) {
      throw new NotFoundException({
        code: BookingErrorCode.CATEGORY_INACTIVE,
        message: 'Category is not active.',
      });
    }
    const capacity = await this.availability.categoryCapacity(
      tenantId,
      request.categoryId as string,
      { start: request.start, end: request.end },
      context,
    );
    if (capacity.available < 1) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_UNAVAILABLE,
        message: 'No remaining category capacity for the requested interval.',
        eligible: capacity.eligible,
        committed: capacity.committed,
        available: capacity.available,
      });
    }
  }

  private toResponse(row: BookingWithHistory): BookingResponse {
    return {
      bookingId: row.id,
      bookingNumber: row.bookingNumber,
      channel: row.channel as BookingChannel,
      inventoryMode: row.inventoryMode,
      status: row.status,
      customerId: row.customerId,
      createdBy: row.createdBy,
      quoteId: row.quoteId,
      requestedCategoryId: row.requestedCategoryId,
      assignedVehicleId: row.assignedVehicleId,
      pickupBranchId: row.pickupBranchId,
      returnBranchId: row.returnBranchId,
      deliveryZoneId: row.deliveryZoneId,
      start: row.startsAt.toISOString(),
      end: row.endsAt.toISOString(),
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      statusHistory: row.statusHistory.map((h) => ({
        historyId: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorUserId: h.actorUserId,
        reason: h.reason,
        correlationId: h.correlationId,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }
}
