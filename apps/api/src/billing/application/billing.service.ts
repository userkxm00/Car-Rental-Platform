import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { parseBookingTotals } from '../../pricing/domain/booking-totals';
import { isPaymentEligibleStatus } from '../../payments/domain/payment-rules';
import { deriveFinanceReconciliation } from '../domain/billing.rules';
import {
  BillingRepository,
  BookingFinanceContext,
  InvoiceRow,
  LedgerRow,
} from '../infrastructure/billing.repository';

export const BillingErrorCode = {
  BILLING_BOOKING_NOT_FOUND: 'BILLING_BOOKING_NOT_FOUND',
  BILLING_BOOKING_NOT_ELIGIBLE: 'BILLING_BOOKING_NOT_ELIGIBLE',
  BILLING_INVOICE_NOT_FOUND: 'BILLING_INVOICE_NOT_FOUND',
  BILLING_INVOICE_STATE: 'BILLING_INVOICE_STATE',
} as const;

export interface LedgerEntryResponse {
  id: string;
  kind: string;
  description: string | null;
  currency: string;
  amountMinor: number;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

export interface InvoiceItemResponse {
  kind: string;
  description: string;
  amountMinor: number;
}

export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  status: 'ISSUED' | 'VOIDED';
  currency: string;
  totalMinor: number;
  createdAt: string;
  voidedAt: string | null;
  items: InvoiceItemResponse[];
}

/** 09-B07 reconciliation view over one booking. */
export interface FinanceSummaryResponse {
  bookingId: string;
  bookingNumber: string;
  bookingStatus: string;
  currency: string;
  snapshot: { totalMinor: number; depositMinor: number } | null;
  intent: {
    status: string;
    totalMinor: number;
    depositMinor: number;
    paidMinor: number;
    outstandingMinor: number;
  } | null;
  depositHold: { status: string; amountMinor: number } | null;
  records: { confirmed: number; pending: number; voided: number; confirmedTotalMinor: number };
  invoices: { issued: number; voided: number; activeTotalMinor: number | null };
  checks: {
    snapshotPresent: boolean;
    intentMatchesRecords: boolean;
    intentMatchesSnapshot: boolean;
    invoiceMatchesSnapshot: boolean;
    eventsComplete: boolean;
  };
  reconciled: boolean;
}

/**
 * PHASE-09 / 09-B use-cases: the append-only booking ledger (09-B06)
 * and the settlement invoice (09-B02/09-B03). Billing reads and
 * documents money; it never creates it — that stays the 09-A payment
 * pipeline. Permissions are enforced by the controller guards
 * (BILLING_READ / BILLING_MANAGE); this service enforces tenant
 * scoping, booking eligibility and invoice state.
 */
@Injectable()
export class BillingService {
  constructor(private readonly repository: BillingRepository) {}

  private assertEligible(context: BookingFinanceContext): void {
    if (!isPaymentEligibleStatus(context.status)) {
      throw new ConflictException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_ELIGIBLE,
        message: 'Invoices can only be issued for confirmed bookings.',
      });
    }
    if (!parseBookingTotals(context.snapshot)) {
      throw new ConflictException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_ELIGIBLE,
        message: 'The booking has no usable price snapshot.',
      });
    }
  }

  private async requireBookingInTenant(tenantId: string, bookingId: string): Promise<void> {
    const exists = await this.repository.bookingExistsInTenant(tenantId, bookingId);
    if (!exists) {
      throw new NotFoundException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }
  }

  private requireContext(context: BookingFinanceContext | null): BookingFinanceContext {
    if (!context) {
      throw new NotFoundException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }
    return context;
  }

  // ── 09-B06 ledger reads ───────────────────────────────────────────────────

  async getBookingLedger(tenantId: string, bookingId: string): Promise<LedgerEntryResponse[]> {
    await this.requireBookingInTenant(tenantId, bookingId);
    return (await this.repository.findLedger(tenantId, bookingId)).map((row) =>
      this.toLedgerResponse(row),
    );
  }

  async getBookingLedgerForCustomer(userId: string, bookingId: string): Promise<LedgerEntryResponse[]> {
    const context = this.requireContext(
      await this.repository.findBookingFinanceContextForCustomer(userId, bookingId),
    );
    return this.getBookingLedger(context.tenantId, bookingId);
  }

  // ── 09-B07 reconciliation view ─────────────────────────────────────────────

  /** Staff/finance reconciliation: projections + drift checks, read-only. */
  async getBookingFinanceSummary(tenantId: string, bookingId: string): Promise<FinanceSummaryResponse> {
    const source = await this.repository.findFinanceSource(tenantId, bookingId);
    if (!source) {
      throw new NotFoundException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }
    const reconciliation = deriveFinanceReconciliation(source);
    const paidMinor = source.records
      .filter((record) => record.status === 'CONFIRMED')
      .reduce((sum, record) => sum + record.amountMinor, 0);
    const count = (status: string) => source.records.filter((record) => record.status === status).length;
    const activeInvoice = source.invoices.find((invoice) => invoice.status === 'ISSUED') ?? null;
    return {
      bookingId,
      bookingNumber: source.bookingNumber,
      bookingStatus: source.status,
      currency: source.currency,
      snapshot: source.snapshot,
      intent: source.intent
        ? {
            status: source.intent.status,
            totalMinor: source.intent.totalMinor,
            depositMinor: source.intent.depositMinor,
            paidMinor,
            outstandingMinor: source.intent.totalMinor - paidMinor,
          }
        : null,
      depositHold: source.hold
        ? { status: source.hold.status, amountMinor: source.hold.amountMinor }
        : null,
      records: {
        confirmed: count('CONFIRMED'),
        pending: count('PENDING_CONFIRMATION'),
        voided: count('VOIDED'),
        confirmedTotalMinor: paidMinor,
      },
      invoices: {
        issued: source.invoices.filter((invoice) => invoice.status === 'ISSUED').length,
        voided: source.invoices.filter((invoice) => invoice.status === 'VOIDED').length,
        activeTotalMinor: activeInvoice?.totalMinor ?? null,
      },
      checks: {
        snapshotPresent: reconciliation.snapshotPresent,
        intentMatchesRecords: reconciliation.intentMatchesRecords,
        intentMatchesSnapshot: reconciliation.intentMatchesSnapshot,
        invoiceMatchesSnapshot: reconciliation.invoiceMatchesSnapshot,
        eventsComplete: reconciliation.eventsComplete,
      },
      reconciled: reconciliation.reconciled,
    };
  }

  // ── 09-B02/09-B03 invoice lifecycle ───────────────────────────────────────

  async getBookingInvoices(tenantId: string, bookingId: string): Promise<InvoiceResponse[]> {
    await this.requireBookingInTenant(tenantId, bookingId);
    return (await this.repository.findInvoices(tenantId, bookingId)).map((row) =>
      this.toInvoiceResponse(row),
    );
  }

  async getBookingInvoicesForCustomer(userId: string, bookingId: string): Promise<InvoiceResponse[]> {
    const context = this.requireContext(
      await this.repository.findBookingFinanceContextForCustomer(userId, bookingId),
    );
    return this.getBookingInvoices(context.tenantId, bookingId);
  }

  /** Compose items server-side from the immutable snapshot; issue (voiding any active invoice). */
  async issueInvoice(
    tenantId: string,
    bookingId: string,
    actorUserId: string,
  ): Promise<InvoiceResponse> {
    const context = this.requireContext(
      await this.repository.findBookingFinanceContextForUser(actorUserId, bookingId),
    );
    if (context.tenantId !== tenantId) {
      throw new NotFoundException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }
    this.assertEligible(context);

    const totals = parseBookingTotals(context.snapshot) as {
      currency: string;
      totalMinor: number;
      depositMinor: number;
    };
    const items = [
      ...(totals.depositMinor > 0
        ? [{ kind: 'DEPOSIT', description: 'Deposit on booking start', amountMinor: totals.depositMinor }]
        : []),
      {
        kind: 'RENTAL',
        description: 'Rental charges',
        amountMinor: totals.totalMinor - totals.depositMinor,
      },
    ];
    const result = await this.repository.issueInvoice(
      context.tenantId,
      bookingId,
      context.bookingNumber,
      totals.currency,
      items,
      actorUserId,
    );
    if (result.outcome === 'NOT_FOUND') {
      throw new NotFoundException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_FOUND,
        message: 'Booking not found.',
      });
    }
    if (result.outcome === 'STATE') {
      throw new ConflictException({
        code: BillingErrorCode.BILLING_BOOKING_NOT_ELIGIBLE,
        message: result.reason,
      });
    }
    return this.toInvoiceResponse(result.invoice);
  }

  async voidInvoice(
    tenantId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<InvoiceResponse> {
    const result = await this.repository.voidInvoice(tenantId, invoiceId, actorUserId);
    if (result.outcome === 'NOT_FOUND') {
      throw new NotFoundException({
        code: BillingErrorCode.BILLING_INVOICE_NOT_FOUND,
        message: 'Invoice not found.',
      });
    }
    if (result.outcome === 'STATE') {
      throw new ConflictException({
        code: BillingErrorCode.BILLING_INVOICE_STATE,
        message: 'Only issued invoices can be voided.',
      });
    }
    return this.toInvoiceResponse(result.invoice);
  }

  // ── projections ───────────────────────────────────────────────────────────

  private toLedgerResponse(row: LedgerRow): LedgerEntryResponse {
    return {
      id: row.id,
      kind: row.kind,
      description: row.description,
      currency: row.currency,
      amountMinor: row.amountMinor,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toInvoiceResponse(row: InvoiceRow): InvoiceResponse {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      currency: row.currency,
      totalMinor: row.totalMinor,
      createdAt: row.createdAt.toISOString(),
      voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
      items: row.items.map((item) => ({
        kind: item.kind,
        description: item.description,
        amountMinor: item.amountMinor,
      })),
    };
  }
}
