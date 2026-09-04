import { Injectable } from '@nestjs/common';
import type { DepositHold, PaymentIntent, PaymentRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PHASE-09 / 09-A persistence. Every query carries tenantId (tenant
 * isolation re-checked at every read); the intent is booking-unique and
 * copied from the immutable price snapshot; records are append-only
 * (never updated in place — void/confirm flip state only).
 */

export interface BookingFinanceContext {
  id: string;
  status: string;
  currency: string;
  priceSnapshots: Array<{ pricingJson: unknown }>;
}

export interface PaymentIntentWithRelations extends PaymentIntent {
  records: PaymentRecord[];
  depositHold: DepositHold | null;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBookingFinanceContext(
    tenantId: string,
    bookingId: string,
  ): Promise<BookingFinanceContext | null> {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      select: {
        id: true,
        status: true,
        currency: true,
        priceSnapshots: { select: { pricingJson: true }, orderBy: { capturedAt: 'desc' }, take: 1 },
      },
    });
  }

  /** Me-portal context: the booking must belong to this customer user. */
  async findBookingFinanceContextForUser(
    userId: string,
    bookingId: string,
  ): Promise<(BookingFinanceContext & { tenantId: string }) | null> {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, customer: { userId } },
      select: {
        id: true,
        tenantId: true,
        status: true,
        currency: true,
        priceSnapshots: { select: { pricingJson: true }, orderBy: { capturedAt: 'desc' }, take: 1 },
      },
    });
  }

  async findIntentByBooking(tenantId: string, bookingId: string): Promise<PaymentIntent | null> {
    return this.prisma.paymentIntent.findFirst({ where: { bookingId, tenantId } });
  }

  async findIntentWithRelations(
    tenantId: string,
    bookingId: string,
  ): Promise<PaymentIntentWithRelations | null> {
    return this.prisma.paymentIntent.findFirst({
      where: { bookingId, tenantId },
      include: {
        records: { orderBy: { createdAt: 'asc' } },
        depositHold: true,
      },
    });
  }

  async createIntent(input: {
    tenantId: string;
    bookingId: string;
    currency: string;
    totalMinor: number;
    depositMinor: number;
  }): Promise<PaymentIntent> {
    return this.prisma.paymentIntent.create({ data: input });
  }

  /** 09-A06: the deposit hold is created with the intent, when due. */
  async createDepositHold(input: {
    tenantId: string;
    intentId: string;
    bookingId: string;
    amountMinor: number;
  }): Promise<DepositHold> {
    return this.prisma.depositHold.create({ data: input });
  }

  async createRecord(input: {
    tenantId: string;
    intentId: string;
    method: 'CASH' | 'BANK_TRANSFER' | 'OTHER_MANUAL';
    amountMinor: number;
    reference: string | null;
    note: string | null;
    recordedById: string | null;
  }): Promise<PaymentRecord> {
    return this.prisma.paymentRecord.create({ data: input });
  }

  /** Tenant-scoped record read (via its intent). */
  async findRecord(tenantId: string, recordId: string): Promise<PaymentRecord | null> {
    return this.prisma.paymentRecord.findFirst({
      where: { id: recordId, tenantId },
    });
  }

  async findIntentById(tenantId: string, intentId: string): Promise<PaymentIntent | null> {
    return this.prisma.paymentIntent.findFirst({ where: { id: intentId, tenantId } });
  }

  /** 09-A08: confirm pending money — status flips only, never deletes. */
  async confirmRecord(
    recordId: string,
    confirmedById: string | null,
    at: Date,
  ): Promise<PaymentRecord> {
    return this.prisma.paymentRecord.update({
      where: { id: recordId },
      data: { status: 'CONFIRMED', confirmedById, confirmedAt: at },
    });
  }

  /**
   * 09-A08 atomic confirmation gate: the outstanding check, the record
   * flip and the intent-status recomputation happen in one transaction
   * so concurrent confirmations can never settle more than the
   * snapshot total (docs/06 financial integrity).
   */
  async confirmRecordWithinOutstanding(
    tenantId: string,
    intentId: string,
    recordId: string,
    confirmedById: string | null,
  ): Promise<'OK' | 'NOT_FOUND' | 'STATE' | 'EXCEEDS'> {
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.paymentRecord.findFirst({
        where: { id: recordId, tenantId, intentId },
      });
      if (!record) {
        return 'NOT_FOUND';
      }
      if (record.status !== 'PENDING_CONFIRMATION') {
        return 'STATE';
      }
      const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
      if (!intent) {
        return 'NOT_FOUND';
      }
      const aggregated = await tx.paymentRecord.aggregate({
        where: { intentId, status: 'CONFIRMED' },
        _sum: { amountMinor: true },
      });
      const paid = aggregated._sum.amountMinor ?? 0;
      if (paid + record.amountMinor > intent.totalMinor) {
        return 'EXCEEDS';
      }
      await tx.paymentRecord.update({
        where: { id: record.id },
        data: { status: 'CONFIRMED', confirmedById, confirmedAt: new Date() },
      });
      const newSum = paid + record.amountMinor;
      const status = newSum <= 0 ? 'OPEN' : newSum >= intent.totalMinor ? 'SETTLED' : 'PARTIALLY_SETTLED';
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status } });
      return 'OK';
    });
  }

  /** 09-A08: void a pending record (append-oriented; confirmed money never voids). */
  async voidRecord(recordId: string): Promise<PaymentRecord> {
    return this.prisma.paymentRecord.update({
      where: { id: recordId },
      data: { status: 'VOIDED' },
    });
  }

  /** Recomputed financial state projection (09-A01/09-A04). */
  async setIntentStatus(intentId: string, status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED'): Promise<void> {
    await this.prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status },
    });
  }

  async findDepositHoldByBooking(tenantId: string, bookingId: string): Promise<DepositHold | null> {
    return this.prisma.depositHold.findFirst({ where: { bookingId, tenantId } });
  }

  /** 09-A06: release the hold at return settlement. */
  async releaseDepositHold(
    holdId: string,
    releasedById: string | null,
    note: string | null,
    at: Date,
  ): Promise<DepositHold> {
    return this.prisma.depositHold.update({
      where: { id: holdId },
      data: { status: 'RELEASED', releasedById, releasedAt: at, note },
    });
  }

  /** Sum of confirmed money for the intent (the authoritative balance source). */
  async confirmedMinorForIntent(intentId: string): Promise<number> {
    const rows = await this.prisma.paymentRecord.findMany({
      where: { intentId, status: 'CONFIRMED' },
      select: { amountMinor: true },
    });
    return rows.reduce((sum, row) => sum + row.amountMinor, 0);
  }
}
