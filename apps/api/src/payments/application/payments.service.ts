import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentsRepository } from '../infrastructure/payments.repository';
import {
  computeIntentStatus,
  isDepositReleasableStatus,
  isPaymentEligibleStatus,
  outstandingMinor,
  PaymentsErrorCode,
  validatePaymentRecordInput,
} from '../domain/payment-rules';
import type {
  DepositHoldResponse,
  PaymentRecordResponse,
  PaymentSummaryResponse,
} from '../domain/payment-contract';
import type { DepositHold, PaymentIntent, PaymentRecord } from '@prisma/client';

/** Strict totals parsing from the immutable booking price snapshot. */
interface SnapshotTotals {
  currency: string;
  totalMinor: number;
  depositMinor: number;
}

function parseSnapshotTotals(value: unknown): SnapshotTotals | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const candidate = value as { currency?: unknown; totalMinor?: unknown; depositMinor?: unknown };
  if (typeof candidate.currency !== 'string' || candidate.currency.length !== 3) {
    return null;
  }
  const total = candidate.totalMinor;
  const deposit = candidate.depositMinor === undefined ? 0 : candidate.depositMinor;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) {
    return null;
  }
  if (typeof deposit !== 'number' || !Number.isInteger(deposit) || deposit < 0) {
    return null;
  }
  return { currency: candidate.currency, totalMinor: total, depositMinor: deposit };
}

/**
 * PHASE-09 / 09-A use-cases: the booking payment intent (09-A01),
 * manual payment records with evidence (09-A02/09-A03), pay-at-agency
 * state (09-A04), partial payments and balances (09-A05), the deposit
 * hold lifecycle (09-A06) and the manual confirmation workflow
 * (09-A08).
 *
 * Server-authoritative: amounts come from the immutable booking price
 * snapshot; the outstanding balance is always derived from the
 * CONFIRMED records (docs/06); nothing here ever deletes money — voids
 * and refunds are append-oriented state changes.
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly repository: PaymentsRepository) {}

  // ── intent + summary (09-A01/09-A04/09-A05) ───────────────────────────────

  async getBookingPayments(tenantId: string, bookingId: string): Promise<PaymentSummaryResponse> {
    const intent = await this.ensureIntent(tenantId, bookingId);
    const withRelations = await this.repository.findIntentWithRelations(tenantId, bookingId);
    return this.toSummary(intent, withRelations?.records ?? [], withRelations?.depositHold ?? null);
  }

  /** Me-portal: the booking customer reads their own payment state. */
  async getBookingPaymentsForUser(userId: string, bookingId: string): Promise<PaymentSummaryResponse> {
    const context = await this.repository.findBookingFinanceContextForUser(userId, bookingId);
    if (!context) {
      throw new NotFoundException({
        code: PaymentsErrorCode.PAYMENT_BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }
    const intent = await this.ensureIntent(context.tenantId, bookingId);
    const withRelations = await this.repository.findIntentWithRelations(context.tenantId, bookingId);
    return this.toSummary(intent, withRelations?.records ?? [], withRelations?.depositHold ?? null);
  }

  // ── records (09-A02/09-A03/09-A05/09-A08) ─────────────────────────────────

  async recordPayment(
    tenantId: string,
    bookingId: string,
    actorUserId: string | null,
    input: unknown,
  ): Promise<PaymentRecordResponse> {
    const validated = validatePaymentRecordInput(input);
    if (!validated) {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_RECORD_INPUT_INVALID,
        message:
          'method must be CASH/BANK_TRANSFER/OTHER_MANUAL, amountMinor a positive integer, and BANK_TRANSFER requires a reference.',
      });
    }
    const intent = await this.ensureIntent(tenantId, bookingId);
    const confirmed = await this.repository.confirmedMinorForIntent(intent.id);
    if (confirmed + validated.amountMinor > intent.totalMinor) {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
        message: 'This record would exceed the outstanding balance.',
      });
    }
    const record = await this.repository.createRecord({
      tenantId,
      intentId: intent.id,
      method: validated.method,
      amountMinor: validated.amountMinor,
      reference: validated.reference,
      note: validated.note,
      recordedById: actorUserId,
    });
    return this.toRecordResponse(record);
  }

  /** 09-A08: confirm pending money — the authoritative settlement gate. */
  async confirmRecord(
    tenantId: string,
    bookingId: string,
    recordId: string,
    actorUserId: string | null,
  ): Promise<PaymentRecordResponse> {
    const intent = await this.ensureIntent(tenantId, bookingId);
    const outcome = await this.repository.confirmRecordWithinOutstanding(
      tenantId,
      intent.id,
      recordId,
      actorUserId,
    );
    if (outcome === 'NOT_FOUND') {
      throw new NotFoundException({
        code: PaymentsErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record not found for this booking.',
      });
    }
    if (outcome === 'STATE') {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_RECORD_STATE,
        message: 'Only pending records can be confirmed.',
      });
    }
    if (outcome === 'EXCEEDS') {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
        message: 'Confirming this record would exceed the outstanding balance.',
      });
    }
    const record = await this.repository.findRecord(tenantId, recordId);
    return this.toRecordResponse(record as PaymentRecord);
  }

  /** 09-A08: void a pending record (confirmed money never voids). */
  async voidRecord(
    tenantId: string,
    bookingId: string,
    recordId: string,
  ): Promise<PaymentRecordResponse> {
    const intent = await this.ensureIntent(tenantId, bookingId);
    const record = await this.repository.findRecord(tenantId, recordId);
    if (!record || record.intentId !== intent.id) {
      throw new NotFoundException({
        code: PaymentsErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record not found for this booking.',
      });
    }
    if (record.status !== 'PENDING_CONFIRMATION') {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_RECORD_STATE,
        message: 'Only pending records can be voided.',
      });
    }
    const voided = await this.repository.voidRecord(recordId);
    return this.toRecordResponse(voided);
  }

  // ── deposit lifecycle (09-A06) ────────────────────────────────────────────

  async releaseDeposit(
    tenantId: string,
    bookingId: string,
    actorUserId: string | null,
    note: string | null,
  ): Promise<DepositHoldResponse> {
    const context = await this.repository.findBookingFinanceContext(tenantId, bookingId);
    if (!context) {
      throw new NotFoundException({
        code: PaymentsErrorCode.PAYMENT_BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    if (!isDepositReleasableStatus(context.status)) {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_DEPOSIT_NOT_RELEASABLE,
        message: 'The deposit releases once the rental has returned.',
      });
    }
    const hold = await this.repository.findDepositHoldByBooking(tenantId, bookingId);
    if (!hold) {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_DEPOSIT_MISSING,
        message: 'This booking has no deposit hold.',
      });
    }
    if (hold.status !== 'HELD') {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_DEPOSIT_STATE,
        message: `Deposit is already ${hold.status.toLowerCase()}.`,
      });
    }
    const released = await this.repository.releaseDepositHold(
      hold.id,
      actorUserId,
      note,
      new Date(),
    );
    return this.toDepositHoldResponse(released);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * 09-A01: the intent is created lazily from the immutable price
   * snapshot on first payment access — amounts are never client-supplied.
   */
  private async ensureIntent(tenantId: string, bookingId: string): Promise<PaymentIntent> {
    const existing = await this.repository.findIntentByBooking(tenantId, bookingId);
    if (existing) {
      return existing;
    }
    const context = await this.repository.findBookingFinanceContext(tenantId, bookingId);
    if (!context) {
      throw new NotFoundException({
        code: PaymentsErrorCode.PAYMENT_BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    if (!isPaymentEligibleStatus(context.status)) {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_BOOKING_NOT_ELIGIBLE,
        message: 'Payments apply to committed bookings only.',
      });
    }
    const snapshot = context.priceSnapshots[0]?.pricingJson;
    const totals = parseSnapshotTotals(snapshot);
    if (!totals) {
      throw new ConflictException({
        code: PaymentsErrorCode.PAYMENT_PRICING_MISSING,
        message: 'The booking has no committed pricing snapshot.',
      });
    }
    const intent = await this.repository.createIntent({
      tenantId,
      bookingId,
      currency: totals.currency,
      totalMinor: totals.totalMinor,
      depositMinor: totals.depositMinor,
    });
    if (totals.depositMinor > 0) {
      await this.repository.createDepositHold({
        tenantId,
        intentId: intent.id,
        bookingId,
        amountMinor: totals.depositMinor,
      });
    }
    return intent;
  }

  private toSummary(
    intent: PaymentIntent,
    records: PaymentRecord[],
    depositHold: DepositHold | null,
  ): PaymentSummaryResponse {
    const confirmed = records
      .filter((record) => record.status === 'CONFIRMED')
      .reduce((sum, record) => sum + record.amountMinor, 0);
    return {
      bookingId: intent.bookingId,
      currency: intent.currency,
      totalMinor: intent.totalMinor,
      depositMinor: intent.depositMinor,
      status: computeIntentStatus(confirmed, intent.totalMinor),
      paidMinor: confirmed,
      outstandingMinor: outstandingMinor(confirmed, intent.totalMinor),
      records: records.map((record) => this.toRecordResponse(record)),
      depositHold: depositHold ? this.toDepositHoldResponse(depositHold) : null,
    };
  }

  private toRecordResponse(record: PaymentRecord): PaymentRecordResponse {
    return {
      id: record.id,
      method: record.method,
      amountMinor: record.amountMinor,
      reference: record.reference,
      note: record.note,
      status: record.status,
      recordedById: record.recordedById,
      confirmedById: record.confirmedById,
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private toDepositHoldResponse(hold: DepositHold): DepositHoldResponse {
    return {
      id: hold.id,
      amountMinor: hold.amountMinor,
      status: hold.status,
      releasedById: hold.releasedById,
      releasedAt: hold.releasedAt?.toISOString() ?? null,
      note: hold.note,
    };
  }
}
