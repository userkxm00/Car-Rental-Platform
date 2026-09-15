import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { findBookingFinanceContext } from '../../shared/finance/booking-finance-context';
import { parseBookingTotals } from '../../pricing/domain/booking-totals';
import type { FinanceSource, LedgerWrite } from '../domain/billing.rules';

export interface BookingFinanceContext {
  bookingNumber: string;
  tenantId: string;
  currency: string;
  status: string;
  snapshot: unknown;
}

export interface LedgerRow {
  id: string;
  kind: string;
  description: string | null;
  currency: string;
  amountMinor: number;
  sourceType: string;
  sourceId: string | null;
  createdAt: Date;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: 'ISSUED' | 'VOIDED';
  currency: string;
  totalMinor: number;
  createdAt: Date;
  voidedAt: Date | null;
  items: { kind: string; description: string; amountMinor: number }[];
}

export type IssueInvoiceResult =
  | { outcome: 'CREATED'; invoice: InvoiceRow; voidedPreviousId: string | null }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'STATE'; reason: string };

export type VoidInvoiceResult =
  | { outcome: 'VOIDED'; invoice: InvoiceRow }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'STATE' };

/** 09-B07: reconciliation source plus the booking identity fields. */
export interface BookingFinanceSource extends FinanceSource {
  bookingNumber: string;
  status: string;
}

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Booking-scoped context for a user that is a member of the booking's
   * tenant — the caller (09-B service) applies the role check.
   */
  async findBookingFinanceContextForUser(
    userId: string,
    bookingId: string,
  ): Promise<BookingFinanceContext | null> {
    return findBookingFinanceContext(this.prisma, userId, bookingId);
  }

  /** Me-portal: the booking's own customer (no membership required). */
  async findBookingFinanceContextForCustomer(
    userId: string,
    bookingId: string,
  ): Promise<BookingFinanceContext | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customer: { userId } },
      select: {
        id: true,
        tenantId: true,
        bookingNumber: true,
        status: true,
        currency: true,
        priceSnapshots: { select: { pricingJson: true }, orderBy: { capturedAt: 'desc' }, take: 1 },
      },
    });
    if (!booking) {
      return null;
    }
    return {
      bookingNumber: booking.bookingNumber,
      tenantId: booking.tenantId,
      currency: booking.currency,
      status: booking.status,
      snapshot: booking.priceSnapshots[0]?.pricingJson ?? null,
    };
  }

  async bookingExistsInTenant(tenantId: string, bookingId: string): Promise<boolean> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      select: { id: true },
    });
    return booking !== null;
  }

  async appendLedger(
    tenantId: string,
    bookingId: string,
    write: LedgerWrite,
    actorUserId: string | null,
  ): Promise<void> {
    await this.prisma.ledgerTransaction.create({
      data: {
        tenantId,
        bookingId,
        kind: write.kind,
        currency: write.currency,
        amountMinor: write.amountMinor,
        sourceType: write.sourceType,
        sourceId: write.sourceId,
        actorUserId,
        description: write.description,
      },
    });
  }

  async findLedger(tenantId: string, bookingId: string): Promise<LedgerRow[]> {
    const rows = await this.prisma.ledgerTransaction.findMany({
      where: { tenantId, bookingId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        kind: true,
        description: true,
        currency: true,
        amountMinor: true,
        sourceType: true,
        sourceId: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({ ...r, sourceId: r.sourceId ?? null }));
  }

  /**
   * 09-B07: all raw money sources of one booking for the reconciliation
   * projection — read-only, tenant-scoped; totals parse here (strictly,
   * from the immutable snapshot) so the domain rule stays pure.
   */
  async findFinanceSource(tenantId: string, bookingId: string): Promise<BookingFinanceSource | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      select: {
        bookingNumber: true,
        status: true,
        currency: true,
        priceSnapshots: { select: { pricingJson: true }, orderBy: { capturedAt: 'desc' }, take: 1 },
        paymentIntent: {
          select: {
            status: true,
            totalMinor: true,
            depositMinor: true,
            records: { select: { id: true, status: true, amountMinor: true } },
          },
        },
        depositHold: { select: { id: true, status: true, amountMinor: true } },
        invoices: { select: { id: true, status: true, totalMinor: true } },
        ledgerTransactions: { select: { kind: true, sourceId: true } },
      },
    });
    if (!booking) {
      return null;
    }
    const totals = parseBookingTotals(booking.priceSnapshots[0]?.pricingJson ?? null);
    const intent = booking.paymentIntent;
    return {
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      currency: booking.currency,
      snapshot: totals ? { totalMinor: totals.totalMinor, depositMinor: totals.depositMinor } : null,
      intent: intent
        ? { status: intent.status, totalMinor: intent.totalMinor, depositMinor: intent.depositMinor }
        : null,
      records: (intent?.records ?? []).map((record) => ({
        id: record.id,
        status: record.status,
        amountMinor: record.amountMinor,
      })),
      hold: booking.depositHold
        ? {
            id: booking.depositHold.id,
            status: booking.depositHold.status,
            amountMinor: booking.depositHold.amountMinor,
          }
        : null,
      invoices: booking.invoices.map((invoice) => ({
        id: invoice.id,
        status: invoice.status,
        totalMinor: invoice.totalMinor,
      })),
      ledger: booking.ledgerTransactions.map((row) => ({ kind: row.kind, sourceId: row.sourceId ?? null })),
    };
  }

  async findInvoices(tenantId: string, bookingId: string): Promise<InvoiceRow[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, bookingId },
      orderBy: { createdAt: 'asc' },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    return invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      status: i.status,
      currency: i.currency,
      totalMinor: i.totalMinor,
      createdAt: i.createdAt,
      voidedAt: i.voidedAt,
      items: i.items.map((it) => ({
        kind: it.kind,
        description: it.description,
        amountMinor: it.amountMinor,
      })),
    }));
  }

  /** One ISSUED invoice per booking — issue, or void-and-reissue. */
  async issueInvoice(
    tenantId: string,
    bookingId: string,
    bookingNumber: string,
    currency: string,
    items: { kind: string; description: string; amountMinor: number }[],
    actorUserId: string,
  ): Promise<IssueInvoiceResult> {
    const totalMinor = items.reduce((sum, item) => sum + item.amountMinor, 0);

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, tenantId },
        select: { id: true, status: true },
      });
      if (!booking) {
        return { outcome: 'NOT_FOUND' as const };
      }

      const invoiceCount = await tx.invoice.count({ where: { bookingId } });
      const invoiceNumber = `INV-${bookingNumber}-${`${invoiceCount + 1}`.padStart(3, '0')}`;

      const active = await tx.invoice.findFirst({
        where: { bookingId, status: 'ISSUED' },
        orderBy: { createdAt: 'asc' },
      });
      if (active) {
        await tx.invoice.update({
          where: { id: active.id },
          data: { status: 'VOIDED', voidedById: actorUserId, voidedAt: new Date() },
        });
        await tx.ledgerTransaction.create({
          data: {
            tenantId,
            bookingId,
            kind: 'INVOICE_VOIDED',
            currency: active.currency,
            amountMinor: 0,
            sourceType: 'INVOICE',
            sourceId: active.id,
            actorUserId,
            description: 'Superseded by corrected invoice',
          },
        });
      }

      const created = await tx.invoice.create({
        data: {
          tenantId,
          bookingId,
          invoiceNumber,
          currency,
          totalMinor,
          issuedById: actorUserId,
          items: {
            create: items.map((item) => ({
              kind: item.kind,
              description: item.description,
              amountMinor: item.amountMinor,
            })),
          },
        },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      await tx.ledgerTransaction.create({
        data: {
          tenantId,
          bookingId,
          kind: 'INVOICE_ISSUED',
          currency,
          amountMinor: 0,
          sourceType: 'INVOICE',
          sourceId: created.id,
          actorUserId,
          description: `Invoice ${invoiceNumber}`,
        },
      });

      return {
        outcome: 'CREATED' as const,
        invoice: {
          id: created.id,
          invoiceNumber: created.invoiceNumber,
          status: created.status,
          currency: created.currency,
          totalMinor: created.totalMinor,
          createdAt: created.createdAt,
          voidedAt: created.voidedAt,
          items: created.items.map((it) => ({
            kind: it.kind,
            description: it.description,
            amountMinor: it.amountMinor,
          })),
        },
        voidedPreviousId: active?.id ?? null,
      };
    });
  }

  async voidInvoice(
    tenantId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<VoidInvoiceResult> {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      if (!invoice) {
        return { outcome: 'NOT_FOUND' as const };
      }
      if (invoice.status !== 'ISSUED') {
        return { outcome: 'STATE' as const };
      }
      const voided = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'VOIDED', voidedById: actorUserId, voidedAt: new Date() },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      await tx.ledgerTransaction.create({
        data: {
          tenantId,
          bookingId: invoice.bookingId,
          kind: 'INVOICE_VOIDED',
          currency: invoice.currency,
          amountMinor: 0,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
          actorUserId,
          description: `Invoice ${invoice.invoiceNumber} voided`,
        },
      });
      return {
        outcome: 'VOIDED' as const,
        invoice: {
          id: voided.id,
          invoiceNumber: voided.invoiceNumber,
          status: voided.status,
          currency: voided.currency,
          totalMinor: voided.totalMinor,
          createdAt: voided.createdAt,
          voidedAt: voided.voidedAt,
          items: voided.items.map((it) => ({
            kind: it.kind,
            description: it.description,
            amountMinor: it.amountMinor,
          })),
        },
      };
    });
  }
}
