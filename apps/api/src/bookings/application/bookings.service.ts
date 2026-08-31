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
import {
  InvalidTransitionError,
  resolveTransition,
  type BookingTransition,
} from '../domain/booking-transitions';
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
   * 05-C01/C02: attach the customer and/or the quote that prices the
   * booking, then move DRAFT|HOLD → PENDING_CONFIRMATION.
   */
  async requestConfirmation(
    tenantId: string,
    actorUserId: string | null,
    bookingId: string,
    body: { customerId?: string; quoteId?: string },
  ): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'requestConfirmation');

    const customerId = body.customerId ?? booking.customerId ?? null;
    const quoteId = body.quoteId ?? booking.quoteId ?? null;
    if (quoteId) {
      const quote = await this.repository.findQuoteInTenant(tenantId, quoteId);
      if (!quote) {
        throw new NotFoundException({
          code: BookingErrorCode.BOOKING_QUOTE_MISMATCH,
          message: 'Quote not found in this agency.',
        });
      }
      const targetMatches =
        (booking.inventoryMode === 'VEHICLE' && quote.vehicleId === booking.assignedVehicleId) ||
        (booking.inventoryMode === 'CATEGORY' && quote.categoryId === booking.requestedCategoryId);
      if (!targetMatches) {
        throw new ConflictException({
          code: BookingErrorCode.BOOKING_QUOTE_MISMATCH,
          message: 'Quote target does not match the booking target.',
        });
      }
      if (quote.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException({
          code: BookingErrorCode.BOOKING_QUOTE_MISMATCH,
          message: 'Quote has expired — request a fresh quote.',
        });
      }
    }

    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.request_confirmation',
      data: { customerId, quoteId },
    });
    return this.toResponse(row);
  }

  /**
   * 05-C03: confirm PENDING_CONFIRMATION → CONFIRMED. Preconditions: the
   * customer is known, the inventory is still safe (vehicle: guard-exempt
   * conflict re-check + live hold; category: remaining capacity), and the
   * commercial snapshot (05-B06) is captured from the linked quote (null
   * until the pricing engine, PHASE-06). The vehicle hold is refreshed to
   * cover the full rental interval.
   */
  async confirmBooking(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'confirm');

    if (!booking.customerId) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_CUSTOMER_REQUIRED,
        message: 'Confirmation requires the customer identity.',
      });
    }

    const interval = { start: booking.startsAt, end: booking.endsAt };
    if (booking.inventoryMode === 'VEHICLE') {
      if (!booking.assignedVehicleId) {
        throw new ConflictException({
          code: BookingErrorCode.BOOKING_ASSIGNMENT_REQUIRED,
          message: 'Confirmation requires an assigned vehicle.',
        });
      }
      const hold = await this.repository.findActiveHold(bookingId);
      if (!hold) {
        throw new ConflictException({
          code: BookingErrorCode.BOOKING_HOLD_NOT_ACTIVE,
          message: 'No live hold — place a hold before confirming.',
        });
      }
      const conflicts = await this.repository.conflictingCommitmentsExcludingHold(
        booking.assignedVehicleId,
        interval,
        hold.id,
      );
      if (conflicts.length > 0) {
        throw new ConflictException({
          code: BookingErrorCode.INTERVAL_CONFLICT,
          message: 'Interval is no longer safe to confirm.',
        });
      }
      await this.repository.updateBookingHold({
        vehicleId: booking.assignedVehicleId,
        holdId: hold.id,
        status: 'ACTIVE',
        expiresAt: booking.endsAt,
      });
    } else {
      const capacity = await this.availability.categoryCapacity(
        tenantId,
        booking.requestedCategoryId as string,
        interval,
        { pickupBranchId: booking.pickupBranchId ?? undefined },
      );
      if (capacity.available < 1) {
        throw new ConflictException({
          code: BookingErrorCode.BOOKING_UNAVAILABLE,
          message: 'No remaining category capacity at confirmation.',
        });
      }
    }

    // 05-B06: capture the immutable commercial snapshot from the quote.
    const pricing = booking.quoteId
      ? await this.repository.findQuotePricing(tenantId, booking.quoteId)
      : null;

    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.confirmed',
    });
    if (booking.quoteId) {
      await this.repository.capturePriceSnapshot(bookingId, pricing);
    }
    return this.toResponse(row);
  }

  /** 05-C05: CONFIRMED → READY_FOR_PICKUP (preparation completed). */
  async markReady(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'markReady');
    if (!booking.assignedVehicleId) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_ASSIGNMENT_REQUIRED,
        message: 'A physical vehicle must be assigned before pickup (05-D07).',
      });
    }
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.ready_for_pickup',
    });
    return this.toResponse(row);
  }

  /** 05-C06: READY_FOR_PICKUP → ACTIVE (pickup/check-out) — consumes the hold. */
  async checkOut(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'checkOut');
    if (!booking.assignedVehicleId) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_ASSIGNMENT_REQUIRED,
        message: 'Check-out requires an assigned vehicle.',
      });
    }
    const hold = await this.repository.findActiveHold(bookingId);
    if (hold?.vehicleId) {
      await this.repository.updateBookingHold({
        vehicleId: hold.vehicleId,
        holdId: hold.id,
        status: 'CONSUMED',
      });
    }
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.checked_out',
    });
    return this.toResponse(row);
  }

  /** 05-C07: ACTIVE → RETURN_PENDING (return requested/notified). */
  async requestReturn(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'requestReturn');
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.return_requested',
    });
    return this.toResponse(row);
  }

  /** 05-C08: RETURN_PENDING → RETURNED (vehicle physically returned). */
  async completeReturn(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'completeReturn');
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.returned',
    });
    return this.toResponse(row);
  }

  /** 05-C09: RETURNED → SETTLEMENT_PENDING (settlement opened). */
  async openSettlement(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'openSettlement');
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.settlement_opened',
    });
    return this.toResponse(row);
  }

  /**
   * 05-C10: SETTLEMENT_PENDING → COMPLETED. Financial settlement
   * conditions are enforced with the payments phase (PHASE-09); this
   * command is the explicit, audited close of the lifecycle.
   */
  async completeBooking(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'complete');
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.completed',
    });
    return this.toResponse(row);
  }

  /**
   * 05-C11: exceptional states. Cancel releases the hold; policy/refund
   * evaluation lands with 05-D01/D02.
   */
  async cancelBooking(
    tenantId: string,
    actorUserId: string | null,
    bookingId: string,
    reason: string,
  ): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'cancel');
    this.requireReason(reason);
    await this.releaseHoldIfAny(bookingId);
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: `booking.cancelled:${reason}`,
    });
    return this.toResponse(row);
  }

  /** 05-C11: PENDING_CONFIRMATION → REJECTED (agency declines). */
  async rejectBooking(
    tenantId: string,
    actorUserId: string | null,
    bookingId: string,
    reason: string,
  ): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'reject');
    this.requireReason(reason);
    await this.releaseHoldIfAny(bookingId);
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: `booking.rejected:${reason}`,
    });
    return this.toResponse(row);
  }

  /** 05-C11: HOLD → EXPIRED once the booking's own hold has expired. */
  async expireBooking(tenantId: string, actorUserId: string | null, bookingId: string): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'expire');
    const hold = await this.repository.findActiveHold(bookingId);
    if (!hold) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_HOLD_NOT_ACTIVE,
        message: 'No live hold to expire.',
      });
    }
    if (hold.expiresAt.getTime() > Date.now()) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_HOLD_NOT_EXPIRED,
        message: 'Hold has not expired yet.',
      });
    }
    await this.repository.updateBookingHold({
      vehicleId: hold.vehicleId as string,
      holdId: hold.id,
      status: 'EXPIRED',
    });
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: 'booking.hold_expired',
    });
    return this.toResponse(row);
  }

  /** 05-C11: READY_FOR_PICKUP → NO_SHOW (documented policy outcome). */
  async markNoShow(
    tenantId: string,
    actorUserId: string | null,
    bookingId: string,
    reason: string,
  ): Promise<BookingResponse> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const { to } = this.resolve(booking, 'markNoShow');
    this.requireReason(reason);
    await this.releaseHoldIfAny(bookingId);
    const row = await this.repository.applyTransition({
      bookingId,
      from: booking.status,
      to,
      actorUserId,
      reason: `booking.no_show:${reason}`,
    });
    return this.toResponse(row);
  }

  private async requireBooking(tenantId: string, bookingId: string): Promise<BookingWithHistory> {
    const booking = await this.repository.findInTenant(tenantId, bookingId);
    if (!booking) {
      throw new NotFoundException({
        code: BookingErrorCode.BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    return booking;
  }

  private requireReason(reason: string): void {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new ConflictException({
        code: BookingErrorCode.BOOKING_REASON_REQUIRED,
        message: 'A reason is required for this transition.',
      });
    }
  }

  private async releaseHoldIfAny(bookingId: string): Promise<void> {
    const hold = await this.repository.findActiveHold(bookingId);
    if (hold?.vehicleId) {
      await this.repository.updateBookingHold({
        vehicleId: hold.vehicleId,
        holdId: hold.id,
        status: 'RELEASED',
      });
    }
  }

  /** Resolves a command with the stable API error for invalid moves. */
  private resolve(booking: BookingWithHistory, command: string): BookingTransition {
    try {
      return resolveTransition(booking.status, command);
    } catch (error) {
      return this.transitionError(error);
    }
  }

  /** Maps a domain transition rejection to the stable API error. */
  private transitionError(error: unknown): never {
    if (error instanceof InvalidTransitionError) {
      throw new ConflictException({
        code: error.code,
        message: error.message,
      });
    }
    throw error;
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
