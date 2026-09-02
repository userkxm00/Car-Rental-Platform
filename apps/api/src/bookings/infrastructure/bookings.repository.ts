import { Injectable } from '@nestjs/common';
import { Prisma, type BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertIntervalFree,
  expireStaleHolds,
  withVehicleCommitmentLock,
  IntervalConflictError,
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
  agencySlug: string | null;
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
  tenant: { select: { slug: true } },
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

  async create(
    input: {
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
    },
    idempotency?: IdempotencyScope | null,
  ): Promise<BookingWithHistory> {
    const created = await this.prisma.$transaction(async (tx) => {
      if (idempotency) {
        await claimIdempotency(tx, idempotency);
      }
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
        include: { tenant: { select: { slug: true } } },
      });
      if (idempotency) {
        await tx.bookingIdempotencyRecord.update({
          where: {
            tenantId_actorUserId_command_idempotencyKey: {
              tenantId: idempotency.tenantId,
              actorUserId: idempotency.actorUserId,
              command: idempotency.command,
              idempotencyKey: idempotency.idempotencyKey,
            },
          },
          data: { bookingId: booking.id },
        });
      }
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

  /**
   * 07-E09: bookings visible to a marketplace customer — created by the
   * user or attached to one of the user's tenant customer records.
   */
  async listForUser(userId: string): Promise<BookingWithHistory[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { OR: [{ createdBy: userId }, { customer: { userId } }] },
      include: HISTORY_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return bookings.map((b) => this.toDomain(b, b.statusHistory));
  }

  /** 07-E09: single own booking — anything else resolves to 404. */
  async findForUser(userId: string, bookingId: string): Promise<BookingWithHistory | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ createdBy: userId }, { customer: { userId } }] },
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
  async applyTransition(
    input: {
      bookingId: string;
      from: BookingStatus;
      to: BookingStatus;
      actorUserId: string | null;
      reason: string;
      data?: {
        customerId?: string | null;
        quoteId?: string | null;
      };
    },
    idempotency?: IdempotencyScope | null,
  ): Promise<BookingWithHistory> {
    const booking = await this.prisma.$transaction(async (tx) => {
      if (idempotency) {
        await claimIdempotency(tx, idempotency, input.bookingId);
      }
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
  /**
   * 07-E05: bookings reference the tenant's customer records — a customer
   * id is only ever accepted when it belongs to this agency (the tenant
   * scope of the customer master keeps cross-tenant identity out).
   */
  async findCustomerInTenant(tenantId: string, customerId: string): Promise<{ id: string } | null> {
    return this.prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
  }

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
  ): Promise<unknown> {
    const quote = await this.prisma.quoteRecord.findFirst({
      where: { id: quoteId, tenantId },
      select: { pricingJson: true },
    });
    return quote?.pricingJson ?? null;
  }

  /** 05-B06: capture the immutable commercial snapshot at confirmation. */
  async capturePriceSnapshot(bookingId: string, pricingJson: unknown): Promise<void> {
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
  async placeBookingHold(
    input: {
      tenantId: string;
      bookingId: string;
      vehicleId: string;
      channel: string;
      start: Date;
      end: Date;
      expiresAt: Date;
      createdBy: string | null;
    },
    idempotency?: IdempotencyScope | null,
  ): Promise<BookingWithHistory> {
    const result = await withVehicleCommitmentLock(this.prisma, input.vehicleId, async (tx) => {
      if (idempotency) {
        await claimIdempotency(tx, idempotency, input.bookingId);
      }
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

  /**
   * 05-D01/D02: cancel with the policy record — status update, audit
   * history and the cancellation row land in one transaction. The policy
   * version and financial result slots are filled by phases 06/09.
   */
  async cancelWithRecord(input: {
    bookingId: string;
    from: BookingStatus;
    actorUserId: string | null;
    reason: string;
    initiator: 'CUSTOMER' | 'AGENCY';
  }): Promise<BookingWithHistory> {
    const booking = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.updateMany({
        where: { id: input.bookingId, status: input.from },
        data: { status: 'CANCELLED' },
      });
      if (updated.count !== 1) {
        throw new Error('BOOKING_INVALID_TRANSITION: concurrent transition lost');
      }
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: input.from,
          toStatus: 'CANCELLED',
          actorUserId: input.actorUserId,
          reason: `booking.cancelled:${input.reason}`,
        },
      });
      await tx.bookingCancellation.create({
        data: {
          bookingId: input.bookingId,
          initiator: input.initiator,
          reason: input.reason,
          actorUserId: input.actorUserId,
        },
      });
      return tx.booking.findUniqueOrThrow({
        where: { id: input.bookingId },
        include: HISTORY_INCLUDE,
      });
    });
    return this.toDomain(booking, booking.statusHistory);
  }

  /** 05-D03: pairs of expired ACTIVE holds on HOLD bookings. */
  async findExpiredHoldBookings(tenantId: string, now: Date): Promise<Array<{ holdId: string; vehicleId: string; bookingId: string }>> {
    return this.prisma.$queryRaw`
      SELECT h."id" AS "holdId", h."vehicleId" AS "vehicleId", h."bookingId" AS "bookingId"
      FROM "booking_holds" h
      JOIN "bookings" b ON b."id" = h."bookingId"
      WHERE h."tenantId" = ${tenantId}::uuid
        AND h."status" = 'ACTIVE'
        AND h."expiresAt" <= ${now}
        AND b."status" = 'HOLD'`;
  }

  /**
   * 05-D03: sweep expired holds — for each pair, the hold is expired and
   * the booking moved HOLD→EXPIRED under the vehicle commitment lock.
   * Returns the number of bookings expired.
   */
  async sweepExpiredHolds(tenantId: string): Promise<number> {
    const pairs = await this.findExpiredHoldBookings(tenantId, new Date());
    let expired = 0;
    for (const pair of pairs) {
      if (!pair.vehicleId) {
        continue;
      }
      await withVehicleCommitmentLock(this.prisma, pair.vehicleId, async (tx) => {
        const holdUpdated = await tx.bookingHold.updateMany({
          where: { id: pair.holdId, status: 'ACTIVE' },
          data: { status: 'EXPIRED' },
        });
        if (holdUpdated.count !== 1) {
          return;
        }
        const bookingUpdated = await tx.booking.updateMany({
          where: { id: pair.bookingId, status: 'HOLD' },
          data: { status: 'EXPIRED' },
        });
        if (bookingUpdated.count !== 1) {
          return;
        }
        await tx.bookingStatusHistory.create({
          data: {
            bookingId: pair.bookingId,
            fromStatus: 'HOLD',
            toStatus: 'EXPIRED',
            actorUserId: null,
            reason: 'booking.hold_expired',
          },
        });
        expired += 1;
      });
    }
    return expired;
  }

  /** 05-D05: create the extension request (REQUESTED) — idempotent. */
  async createExtension(
    input: {
      bookingId: string;
      originalEndsAt: Date;
      requestedEndsAt: Date;
      reason: string | null;
      requestedBy: string | null;
    },
    idempotency?: IdempotencyScope | null,
  ): Promise<{ id: string; status: string; requestedEndsAt: Date; originalEndsAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      if (idempotency) {
        await claimIdempotency(tx, idempotency, input.bookingId);
      }
      return tx.bookingExtension.create({
        data: {
          bookingId: input.bookingId,
          originalEndsAt: input.originalEndsAt,
          requestedEndsAt: input.requestedEndsAt,
          reason: input.reason,
          requestedBy: input.requestedBy,
        },
      });
    });
  }

  /** Tenant-scoped extension lookup via the booking relation. */
  async findExtensionInTenant(
    tenantId: string,
    extensionId: string,
  ): Promise<{
    id: string;
    bookingId: string;
    status: string;
    originalEndsAt: Date;
    requestedEndsAt: Date;
    bookingEndsAt: Date;
    bookingStatus: BookingStatus;
    inventoryMode: string;
    assignedVehicleId: string | null;
    requestedCategoryId: string | null;
  } | null> {
    const extension = await this.prisma.bookingExtension.findFirst({
      where: { id: extensionId, booking: { tenantId } },
      include: { booking: true },
    });
    if (!extension) {
      return null;
    }
    return {
      id: extension.id,
      bookingId: extension.bookingId,
      status: extension.status,
      originalEndsAt: extension.originalEndsAt,
      requestedEndsAt: extension.requestedEndsAt,
      bookingEndsAt: extension.booking.endsAt,
      bookingStatus: extension.booking.status,
      inventoryMode: extension.booking.inventoryMode,
      assignedVehicleId: extension.booking.assignedVehicleId,
      requestedCategoryId: extension.booking.requestedCategoryId,
    };
  }

  /**
   * 05-D06: approve the extension under the commitment guard — the
   * extension interval is re-checked, the hold and the booking interval are
   * extended, history and the extension row update in the same transaction.
   */
  async approveExtension(input: {
    bookingId: string;
    extensionId: string;
    vehicleId: string;
    holdId: string | null;
    newEndsAt: Date;
    originalEndsAt: Date;
    decidedBy: string | null;
  }): Promise<void> {
    await withVehicleCommitmentLock(this.prisma, input.vehicleId, async (tx) => {
      await assertIntervalFreeExcludingHold(
        tx,
        input.vehicleId,
        { start: input.originalEndsAt, end: input.newEndsAt },
        input.holdId,
      );
      // The hold is live before the rental (HOLD/… states); an ACTIVE
      // rental has no hold — the booking interval itself is the commitment.
      if (input.holdId) {
        const holdUpdated = await tx.bookingHold.updateMany({
          where: { id: input.holdId, status: 'ACTIVE' },
          data: { endsAt: input.newEndsAt, expiresAt: input.newEndsAt },
        });
        if (holdUpdated.count !== 1) {
          throw new Error('BOOKING_HOLD_NOT_ACTIVE: hold already transitioned');
        }
      }
      const bookingUpdated = await tx.booking.updateMany({
        where: { id: input.bookingId, status: 'ACTIVE' },
        data: { endsAt: input.newEndsAt },
      });
      if (bookingUpdated.count !== 1) {
        throw new Error('BOOKING_INVALID_TRANSITION: booking not ACTIVE');
      }
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: 'ACTIVE',
          toStatus: 'ACTIVE',
          actorUserId: input.decidedBy,
          reason: `booking.extended:${input.extensionId}`,
        },
      });
      await tx.bookingExtension.updateMany({
        where: { id: input.extensionId, status: 'REQUESTED' },
        data: { status: 'APPROVED', decidedBy: input.decidedBy, decidedAt: new Date() },
      });
    });
  }

  /** 05-D06: reject the extension request (audited). */
  async rejectExtension(input: {
    bookingId: string;
    extensionId: string;
    decidedBy: string | null;
    reason: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookingExtension.updateMany({
        where: { id: input.extensionId, status: 'REQUESTED' },
        data: { status: 'REJECTED', decidedBy: input.decidedBy, decidedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new Error('BOOKING_EXTENSION_NOT_PENDING: extension already decided');
      }
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: 'ACTIVE',
          toStatus: 'ACTIVE',
          actorUserId: input.decidedBy,
          reason: `booking.extension_rejected:${input.reason}`,
        },
      });
    });
  }

  /**
   * 05-D07: reassign the booking to another vehicle — both vehicle rows are
   * locked in stable id order (no deadlocks), the new interval is checked
   * excluding the old hold, the hold moves to the new vehicle, and the
   * assignment + audit history land in the same transaction.
   */
  async reassignVehicle(input: {
    tenantId: string;
    bookingId: string;
    fromVehicleId: string;
    toVehicleId: string;
    holdId: string;
    holdExpiresAt: Date;
    holdChannel: string;
    interval: { start: Date; end: Date };
    actorUserId: string | null;
    reason: string;
    fromStatus: BookingStatus;
  }): Promise<BookingWithHistory> {
    const lockOrder = [input.fromVehicleId, input.toVehicleId].sort();
    const booking = await this.prisma.$transaction(async (tx) => {
      for (const vehicleId of lockOrder) {
        await tx.$queryRaw`SELECT id FROM "vehicles" WHERE id = ${vehicleId}::uuid FOR UPDATE`;
      }
      await assertIntervalFreeExcludingHold(tx, input.toVehicleId, input.interval, input.holdId);

      const holdReleased = await tx.bookingHold.updateMany({
        where: { id: input.holdId, status: 'ACTIVE' },
        data: { status: 'RELEASED' },
      });
      if (holdReleased.count !== 1) {
        throw new Error('BOOKING_HOLD_NOT_ACTIVE: hold already transitioned');
      }
      await tx.bookingHold.create({
        data: {
          tenantId: input.tenantId,
          vehicleId: input.toVehicleId,
          bookingId: input.bookingId,
          channel: input.holdChannel as never,
          startsAt: input.interval.start,
          endsAt: input.interval.end,
          expiresAt: input.holdExpiresAt,
          createdBy: input.actorUserId,
        },
      });
      const updated = await tx.booking.updateMany({
        where: { id: input.bookingId, status: input.fromStatus },
        data: { assignedVehicleId: input.toVehicleId },
      });
      if (updated.count !== 1) {
        throw new Error('BOOKING_INVALID_TRANSITION: concurrent transition lost');
      }
      await tx.bookingAssignment.create({
        data: {
          bookingId: input.bookingId,
          fromVehicleId: input.fromVehicleId,
          toVehicleId: input.toVehicleId,
          reason: input.reason,
          actorUserId: input.actorUserId,
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: input.bookingId,
          fromStatus: input.fromStatus,
          toStatus: input.fromStatus,
          actorUserId: input.actorUserId,
          reason: `booking.reassigned:${input.toVehicleId}`,
        },
      });
      return tx.booking.findUniqueOrThrow({
        where: { id: input.bookingId },
        include: HISTORY_INCLUDE,
      });
    });
    return this.toDomain(booking, booking.statusHistory);
  }

  /** 05-D09: reads the stored replay result for an idempotent command. */
  async findIdempotencyRecord(
    scope: IdempotencyScope,
  ): Promise<{ bookingId: string | null } | null> {
    return findIdempotencyRecord(this.prisma, scope);
  }

  /** 05-D05: the most recent extension request of a booking (replay path). */
  async findLatestExtension(bookingId: string): Promise<{
    id: string;
    status: string;
    requestedEndsAt: Date;
    originalEndsAt: Date;
  } | null> {
    return this.prisma.bookingExtension.findFirst({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private toDomain(
    booking: {
      id: string;
      tenantId: string;
      tenant?: { slug: string } | null;
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
      agencySlug: booking.tenant?.slug ?? null,
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

// ── 05-D lifecycle additions ────────────────────────────────────────────────

/** Raised inside a transaction when an idempotent command replays (05-D09). */
export class ReplayedCommandError extends Error {
  constructor(readonly bookingId: string | null) {
    super('REPLAYED_COMMAND');
    this.name = 'ReplayedCommandError';
  }
}

export interface IdempotencyScope {
  tenantId: string;
  actorUserId: string;
  command: string;
  idempotencyKey: string;
}

/**
 * 05-D09: claims the idempotency key inside the command's own transaction —
 * a replay (existing record) aborts the transaction with
 * {@link ReplayedCommandError} so nothing is written twice.
 */
export async function claimIdempotency(
  tx: Prisma.TransactionClient,
  scope: IdempotencyScope,
  knownBookingId: string | null = null,
): Promise<void> {
  const existing = await tx.bookingIdempotencyRecord.findUnique({
    where: {
      tenantId_actorUserId_command_idempotencyKey: {
        tenantId: scope.tenantId,
        actorUserId: scope.actorUserId,
        command: scope.command,
        idempotencyKey: scope.idempotencyKey,
      },
    },
  });
  if (existing) {
    throw new ReplayedCommandError(existing.bookingId);
  }
  await tx.bookingIdempotencyRecord.create({
    data: {
      tenantId: scope.tenantId,
      actorUserId: scope.actorUserId,
      command: scope.command,
      idempotencyKey: scope.idempotencyKey,
      bookingId: knownBookingId,
    },
  });
}

/** Reads the stored replay result for an idempotent command (05-D09). */
export async function findIdempotencyRecord(
  prisma: PrismaService,
  scope: IdempotencyScope,
): Promise<{ bookingId: string | null } | null> {
  return prisma.bookingIdempotencyRecord.findUnique({
    where: {
      tenantId_actorUserId_command_idempotencyKey: {
        tenantId: scope.tenantId,
        actorUserId: scope.actorUserId,
        command: scope.command,
        idempotencyKey: scope.idempotencyKey,
      },
    },
    select: { bookingId: true },
  });
}


/** Interval-free check for one vehicle, excluding a specific hold (05-D06/D07). */
export async function assertIntervalFreeExcludingHold(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  interval: { start: Date; end: Date },
  excludeHoldId: string | null,
  now: Date = new Date(),
): Promise<void> {
  await expireStaleHolds(tx, vehicleId, now);
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT b."id" AS "id"
    FROM "vehicle_blocks" b
    WHERE b."vehicleId" = ${vehicleId}::uuid
      AND b."status" IN ('SCHEDULED', 'ACTIVE')
      AND b."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
    UNION ALL
    SELECT h."id" AS "id"
    FROM "booking_holds" h
    WHERE h."vehicleId" = ${vehicleId}::uuid
      AND h."status" = 'ACTIVE'
      AND (${excludeHoldId}::uuid IS NULL OR h."id" <> ${excludeHoldId}::uuid)
      AND h."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')`;
  if (rows.length > 0) {
    throw new IntervalConflictError(
      `Interval conflicts with ${rows.length} commitment(s) for vehicle ${vehicleId}`,
    );
  }
}
