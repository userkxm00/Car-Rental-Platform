import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertIntervalFree,
  withVehicleCommitmentLock,
} from '../../availability/infrastructure/commitment-guard';
import { formatBookingNumber } from '../domain/booking-rules';
import type { BookingStatus } from '@prisma/client';

/** One append-only status history entry. */
export interface BookingHistoryEntry {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorUserId: string | null;
  reason: string | null;
  correlationId: string | null;
  createdAt: Date;
}

/** Booking row plus its status history (newest first for the API). */
export interface BookingWithHistory {
  id: string;
  tenantId: string;
  bookingNumber: string;
  channel: string;
  inventoryMode: 'VEHICLE' | 'CATEGORY';
  status: BookingStatus;
  customerId: string | null;
  createdBy: string | null;
  quoteId: string | null;
  requestedCategoryId: string | null;
  assignedVehicleId: string | null;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
  startsAt: Date;
  endsAt: Date;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  statusHistory: BookingHistoryEntry[];
}

const HISTORY_INCLUDE = {
  statusHistory: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.BookingInclude;

/**
 * Booking persistence (05-B). Creation is one transaction:
 * per-tenant counter increment (05-B02), the DRAFT row and its first
 * append-only history entry. Hold placement (05-B05) is the guard-protected
 * write path: per-vehicle lock, stale-hold expiry, explicit conflict check,
 * insert + DRAFT→HOLD transition in the same transaction (04-B semantics).
 */
@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Atomic per-tenant counter increment; returns the next sequence number. */
  async nextBookingNumber(tenantId: string, tx: Prisma.TransactionClient): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ nextNumber: number }>>`
      INSERT INTO "booking_counters" ("tenantId", "nextNumber")
      VALUES (${tenantId}::uuid, 1)
      ON CONFLICT ("tenantId") DO UPDATE SET "nextNumber" = "booking_counters"."nextNumber" + 1
      RETURNING "nextNumber"`;
    return Number(rows[0]?.nextNumber ?? 1);
  }

  async create(input: {
    tenantId: string;
    createdBy: string | null;
    channel: string;
    mode: 'VEHICLE' | 'CATEGORY';
    vehicleId: string | null;
    categoryId: string | null;
    pickupBranchId: string | null;
    returnBranchId: string | null;
    deliveryZoneId: string | null;
    start: Date;
    end: Date;
  }): Promise<BookingWithHistory> {
    const created = await this.prisma.$transaction(async (tx) => {
      const sequence = await this.nextBookingNumber(input.tenantId, tx);
      const bookingNumber = formatBookingNumber(sequence);

      const booking = await tx.booking.create({
        data: {
          tenantId: input.tenantId,
          bookingNumber,
          channel: input.channel as never,
          inventoryMode: input.mode,
          status: 'DRAFT',
          createdBy: input.createdBy,
          requestedCategoryId: input.categoryId,
          assignedVehicleId: input.vehicleId,
          pickupBranchId: input.pickupBranchId,
          returnBranchId: input.returnBranchId,
          deliveryZoneId: input.deliveryZoneId,
          startsAt: input.start,
          endsAt: input.end,
        },
      });
      const history = await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: null,
          toStatus: 'DRAFT',
          actorUserId: input.createdBy,
          reason: 'booking.created',
        },
      });
      return { booking, history };
    });

    return this.toDomain(created.booking, [created.history]);
  }

  async findInTenant(tenantId: string, bookingId: string): Promise<BookingWithHistory | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: HISTORY_INCLUDE,
    });
    if (!booking) {
      return null;
    }
    return this.toDomain(booking, booking.statusHistory);
  }

  async listForTenant(tenantId: string): Promise<BookingWithHistory[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { tenantId },
      include: HISTORY_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return bookings.map((b) => this.toDomain(b, b.statusHistory));
  }

  /**
   * 05-B05: place the inventory hold for a DRAFT vehicle booking through
   * the commitment guard, and transition DRAFT→HOLD in the same protected
   * transaction. Throws IntervalConflictError when the interval is taken.
   */
  async placeBookingHold(input: {
    tenantId: string;
    bookingId: string;
    vehicleId: string;
    channel: string;
    start: Date;
    end: Date;
    expiresAt: Date;
    createdBy: string | null;
  }): Promise<BookingWithHistory> {
    const result = await withVehicleCommitmentLock(this.prisma, input.vehicleId, async (tx) => {
      await assertIntervalFree(tx, input.vehicleId, { start: input.start, end: input.end });

      const hold = await tx.bookingHold.create({
        data: {
          tenantId: input.tenantId,
          vehicleId: input.vehicleId,
          bookingId: input.bookingId,
          channel: input.channel as never,
          startsAt: input.start,
          endsAt: input.end,
          expiresAt: input.expiresAt,
          createdBy: input.createdBy,
        },
      });

      const booking = await tx.booking.update({
        where: { id: input.bookingId },
        data: { status: 'HOLD' },
        include: HISTORY_INCLUDE,
      });
      const history = await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: 'DRAFT',
          toStatus: 'HOLD',
          actorUserId: input.createdBy,
          reason: `booking.hold_placed:${hold.id}`,
        },
      });

      return this.toDomain(booking, [...historyOnly(booking), history]);
    });
    return result;
  }

  private toDomain(
    booking: {
      id: string;
      tenantId: string;
      bookingNumber: string;
      channel: string;
      inventoryMode: string;
      status: BookingStatus;
      customerId: string | null;
      createdBy: string | null;
      quoteId: string | null;
      requestedCategoryId: string | null;
      assignedVehicleId: string | null;
      pickupBranchId: string | null;
      returnBranchId: string | null;
      deliveryZoneId: string | null;
      startsAt: Date;
      endsAt: Date;
      currency: string;
      createdAt: Date;
      updatedAt: Date;
    },
    history: Array<{
      id: string;
      fromStatus: BookingStatus | null;
      toStatus: BookingStatus;
      actorUserId: string | null;
      reason: string | null;
      correlationId: string | null;
      createdAt: Date;
    }>,
  ): BookingWithHistory {
    return {
      id: booking.id,
      tenantId: booking.tenantId,
      bookingNumber: booking.bookingNumber,
      channel: booking.channel,
      inventoryMode: booking.inventoryMode as 'VEHICLE' | 'CATEGORY',
      status: booking.status,
      customerId: booking.customerId,
      createdBy: booking.createdBy,
      quoteId: booking.quoteId,
      requestedCategoryId: booking.requestedCategoryId,
      assignedVehicleId: booking.assignedVehicleId,
      pickupBranchId: booking.pickupBranchId,
      returnBranchId: booking.returnBranchId,
      deliveryZoneId: booking.deliveryZoneId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      currency: booking.currency,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      statusHistory: history.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorUserId: h.actorUserId,
        reason: h.reason,
        correlationId: h.correlationId,
        createdAt: h.createdAt,
      })),
    };
  }
}

/** History entries from an `include`-loaded booking, without the new entry. */
function historyOnly(booking: {
  statusHistory: Array<{
    id: string;
    fromStatus: BookingStatus | null;
    toStatus: BookingStatus;
    actorUserId: string | null;
    reason: string | null;
    correlationId: string | null;
    createdAt: Date;
  }>;
}): Array<{
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorUserId: string | null;
  reason: string | null;
  correlationId: string | null;
  createdAt: Date;
}> {
  return booking.statusHistory.map((h) => ({
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorUserId: h.actorUserId,
    reason: h.reason,
    correlationId: h.correlationId,
    createdAt: h.createdAt,
  }));
}
