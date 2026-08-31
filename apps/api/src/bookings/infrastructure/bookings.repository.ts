import { Injectable } from '@nestjs/common';
import { Prisma, type BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertIntervalFree,
  withVehicleCommitmentLock,
} from '../../availability/infrastructure/commitment-guard';
import { formatBookingNumber } from '../domain/booking-rules';

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
   * 05-C: apply one transition atomically — the status update is guarded by
   * the expected source status (concurrent commands cannot both win) and the
   * append-only history entry lands in the same transaction.
   */
  async applyTransition(input: {
    bookingId: string;
    from: BookingStatus;
    to: BookingStatus;
    actorUserId: string | null;
    reason: string;
    data?: {
      customerId?: string | null;
      quoteId?: string | null;
    };
  }): Promise<BookingWithHistory> {
    const booking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: input.bookingId, status: input.from },
        data: {
          status: input.to,
          ...(input.data?.customerId !== undefined ? { customerId: input.data.customerId } : {}),
          ...(input.data?.quoteId !== undefined ? { quoteId: input.data.quoteId } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error('BOOKING_INVALID_TRANSITION: concurrent transition lost');
      }
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: input.from,
          toStatus: input.to,
          actorUserId: input.actorUserId,
          reason: input.reason,
        },
      });
      return tx.booking.findUniqueOrThrow({
        where: { id: input.bookingId },
        include: HISTORY_INCLUDE,
      });
    });
    return this.toDomain(booking, booking.statusHistory);
  }

  /** The booking's active vehicle hold (05-B05/05-C), if any. */
  async findActiveHold(
    bookingId: string,
  ): Promise<{ id: string; vehicleId: string | null; expiresAt: Date; status: string } | null> {
    return this.prisma.bookingHold.findFirst({
      where: { bookingId, status: 'ACTIVE' },
    });
  }

  /**
   * 05-C: refresh the confirmed booking's hold to cover the whole rental
   * interval (confirmation protects the inventory for the full interval),
   * or release/consume it — always under the commitment guard.
   */
  async updateBookingHold(input: {
    vehicleId: string;
    holdId: string;
    status: 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'EXPIRED';
    expiresAt?: Date;
  }): Promise<void> {
    await withVehicleCommitmentLock(this.prisma, input.vehicleId, async (tx) => {
      const updated = await tx.bookingHold.updateMany({
        where: { id: input.holdId, status: 'ACTIVE' },
        data: {
          status: input.status,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error('BOOKING_HOLD_NOT_ACTIVE: hold already transitioned');
      }
    });
  }

  /** Tenant-scoped quote lookup for confirmation linkage (05-C01/C02). */
  async findQuoteInTenant(
    tenantId: string,
    quoteId: string,
  ): Promise<{ id: string; vehicleId: string | null; categoryId: string | null; expiresAt: Date } | null> {
    return this.prisma.quoteRecord.findFirst({
      where: { id: quoteId, tenantId },
      select: { id: true, vehicleId: true, categoryId: true, expiresAt: true },
    });
  }

  /** The quote's pricing slot for the 05-B06 snapshot (null until PHASE-06). */
  async findQuotePricing(
    tenantId: string,
    quoteId: string,
  ): Promise<unknown | null> {
    const quote = await this.prisma.quoteRecord.findFirst({
      where: { id: quoteId, tenantId },
      select: { pricingJson: true },
    });
    return quote?.pricingJson ?? null;
  }

  /** 05-B06: capture the immutable commercial snapshot at confirmation. */
  async capturePriceSnapshot(bookingId: string, pricingJson: unknown | null): Promise<void> {
    await this.prisma.bookingPriceSnapshot.create({
      data: {
        bookingId,
        pricingJson: pricingJson === null ? Prisma.JsonNull : (pricingJson as never),
      },
    });
  }

  /**
   * 05-C03: confirmation re-check — conflicting SCHEDULED/ACTIVE blocks and
   * conflicting ACTIVE holds EXCLUDING the booking's own hold. If anything
   * else overlaps, the interval is no longer safe to confirm.
   */
  async conflictingCommitmentsExcludingHold(
    vehicleId: string,
    interval: { start: Date; end: Date },
    excludeHoldId: string | null,
  ): Promise<Array<{ id: string; kind: 'BLOCK' | 'HOLD' }>> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; kind: 'BLOCK' | 'HOLD' }>>`
      SELECT b."id" AS "id", 'BLOCK' AS "kind"
      FROM "vehicle_blocks" b
      WHERE b."vehicleId" = ${vehicleId}::uuid
        AND b."status" IN ('SCHEDULED', 'ACTIVE')
        AND b."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
      UNION ALL
      SELECT h."id" AS "id", 'HOLD' AS "kind"
      FROM "booking_holds" h
      WHERE h."vehicleId" = ${vehicleId}::uuid
        AND h."status" = 'ACTIVE'
        AND (${excludeHoldId}::uuid IS NULL OR h."id" <> ${excludeHoldId}::uuid)
        AND h."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')`;
    return rows;
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
