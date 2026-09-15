import { ApiClient } from '../client';

/**
 * Typed billing endpoints (PHASE-09 09-B). Mirrors
 * apps/api/src/billing/presentation/billing.controller.ts and the
 * me-portal customer surface. The ledger is the append-only financial
 * event log; invoices are settlement documents assembled server-side
 * from the immutable booking price snapshot.
 */

export type InvoiceStatusDto = 'ISSUED' | 'VOIDED';

export interface LedgerEntryResponseDto {
  id: string;
  kind: string;
  description: string | null;
  currency: string;
  amountMinor: number;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

export interface InvoiceItemResponseDto {
  kind: string;
  description: string;
  amountMinor: number;
}

export interface InvoiceResponseDto {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatusDto;
  currency: string;
  totalMinor: number;
  createdAt: string;
  voidedAt: string | null;
  items: InvoiceItemResponseDto[];
}

/** 09-B07 reconciliation view over one booking. */
export interface FinanceSummaryResponseDto {
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

export interface BillingApi {
  /** GET /agencies/:agencyId/bookings/:bookingId/ledger. */
  ledger(agencyId: string, bookingId: string): Promise<LedgerEntryResponseDto[]>;
  /** GET /agencies/:agencyId/bookings/:bookingId/invoices. */
  invoices(agencyId: string, bookingId: string): Promise<InvoiceResponseDto[]>;
  /** GET /agencies/:agencyId/bookings/:bookingId/finance — staff reconciliation (09-B07). */
  finance(agencyId: string, bookingId: string): Promise<FinanceSummaryResponseDto>;
  /** POST /agencies/:agencyId/bookings/:bookingId/invoices (201). */
  issue(agencyId: string, bookingId: string): Promise<InvoiceResponseDto>;
  /** POST /agencies/:agencyId/bookings/:bookingId/invoices/:invoiceId/void (201). */
  void(agencyId: string, bookingId: string, invoiceId: string): Promise<InvoiceResponseDto>;
}

export interface MeBillingApi {
  /** GET /me/bookings/:bookingId/ledger (own bookings only). */
  ledger(bookingId: string): Promise<LedgerEntryResponseDto[]>;
  /** GET /me/bookings/:bookingId/invoices (own bookings only). */
  invoices(bookingId: string): Promise<InvoiceResponseDto[]>;
}

export function createBillingApi(client: ApiClient): BillingApi {
  const base = (agencyId: string, bookingId: string) =>
    `/agencies/${agencyId}/bookings/${bookingId}`;
  return {
    ledger: (agencyId, bookingId) => client.get(`${base(agencyId, bookingId)}/ledger`),
    invoices: (agencyId, bookingId) => client.get(`${base(agencyId, bookingId)}/invoices`),
    finance: (agencyId, bookingId) => client.get(`${base(agencyId, bookingId)}/finance`),
    issue: (agencyId, bookingId) => client.post(`${base(agencyId, bookingId)}/invoices`),
    void: (agencyId, bookingId, invoiceId) =>
      client.post(`${base(agencyId, bookingId)}/invoices/${invoiceId}/void`),
  };
}

export function createMeBillingApi(client: ApiClient): MeBillingApi {
  return {
    ledger: (bookingId) => client.get(`/me/bookings/${bookingId}/ledger`),
    invoices: (bookingId) => client.get(`/me/bookings/${bookingId}/invoices`),
  };
}
