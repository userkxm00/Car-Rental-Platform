/**
 * 09-B billing domain rules.
 *
 * Financial integrity (docs/06) carries over from 09-A:
 *  - ledger entries are append-only — nothing updates or deletes them;
 *  - every ledger entry is anchored to a booking and its currency comes
 *    from the immutable snapshot (never client input);
 *  - invoice totals are assembled from a server-side item composition
 *    plan, never from client-supplied numbers;
 *  - voiding an invoice preserves the historical row and ledger path
 *    (a corrected settlement is void + a fresh numbered invoice).
 */

export const BILLING_INVOICE_PREFIX = 'INV';

export interface LedgerWrite {
  kind:
    | 'PAYMENT_CONFIRMED'
    | 'PAYMENT_VOIDED'
    | 'DEPOSIT_HELD'
    | 'DEPOSIT_RELEASED'
    | 'INVOICE_ISSUED'
    | 'INVOICE_VOIDED';
  currency: string;
  amountMinor: number;
  sourceType: 'PAYMENT_RECORD' | 'DEPOSIT_HOLD' | 'INVOICE';
  sourceId: string | null;
  description: string | null;
}

export interface InvoiceCompositionItem {
  kind: string;
  description: string;
  amountMinor: number;
}

export interface InvoiceComposition {
  currency: string;
  totalMinor: number;
  items: InvoiceCompositionItem[];
}

/** The amount may not reference anything except a well-formed plan. */
export function composeInvoiceItemsFromTotals(totals: {
  currency: string;
  totalMinor: number;
  depositMinor: number;
}): InvoiceComposition {
  const items: InvoiceCompositionItem[] = [];
  if (totals.depositMinor > 0) {
    items.push({
      kind: 'DEPOSIT',
      description: 'Deposit on booking start',
      amountMinor: totals.depositMinor,
    });
  }
  items.push({
    kind: 'RENTAL',
    description: 'Rental charges',
    amountMinor: totals.totalMinor - totals.depositMinor,
  });
  return { currency: totals.currency, totalMinor: totals.totalMinor, items };
}

/** One active (ISSUED) invoice per booking — corrected settlements go through void + re-issue. */
export function composeInvoiceNumber(bookingNumber: string, sequence: number): string {
  const n = `${sequence}`.padStart(3, '0');
  return `${BILLING_INVOICE_PREFIX}-${bookingNumber}-${n}`;
}

export interface LedgerLine<T> {
  kind: T;
  description: string | null;
  amountMinor: number;
  sourceId: string | null;
  createdAt: Date;
}

/** Invariants on a ledger window: chronological order and no holes. */
export function isLedgerLineOrdered(createdAt: Date, previous: Date | null): boolean {
  if (previous === null) {
    return true;
  }
  return createdAt.getTime() >= previous.getTime();
}

/** DZD 1,000.00 as "1 000,00 DZD" — a conservative presentational helper. */
export function formatMinorAmountForDisplay(currency: string, amountMinor: number): string {
  const fractionDigits = currency === 'TND' ? 3 : 2;
  const major = amountMinor / Math.pow(10, fractionDigits);
  const formatted = new Intl.NumberFormat('fr-DZ', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(major)
    // ICU may emit U+202F (narrow no-break space) as the group
    // separator — normalise it so display output is stable everywhere.
    .replace(/\u202f/g, '\u00a0')
    .replace(/\u00a0/g, ' ');
  return `${formatted} ${currency}`;
}

// ── 09-B07 reconciliation ────────────────────────────────────────────────────

/**
 * 09-B07: the staff reconciliation view re-derives every money projection
 * from its raw sources (09-A records/holds, the invoice rows and the
 * append-only ledger) and cross-checks them — a drift introduced by an
 * out-of-band write must surface as `reconciled: false`, never be
 * silently absorbed (docs/06 financial integrity).
 */

export interface FinanceSourceRecord {
  id: string;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'VOIDED';
  amountMinor: number;
}

export interface FinanceSourceIntent {
  status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED';
  totalMinor: number;
  depositMinor: number;
}

export interface FinanceSourceHold {
  id: string;
  status: 'HELD' | 'RELEASED' | 'REFUNDED' | 'FORFEITED';
  amountMinor: number;
}

export interface FinanceSourceInvoice {
  id: string;
  status: 'ISSUED' | 'VOIDED';
  totalMinor: number;
}

export interface FinanceSourceLedgerRow {
  kind: string;
  sourceId: string | null;
}

export interface FinanceSource {
  currency: string;
  snapshot: { totalMinor: number; depositMinor: number } | null;
  intent: FinanceSourceIntent | null;
  records: FinanceSourceRecord[];
  hold: FinanceSourceHold | null;
  invoices: FinanceSourceInvoice[];
  ledger: FinanceSourceLedgerRow[];
}

export interface FinanceReconciliation {
  currency: string;
  snapshotPresent: boolean;
  /** paid = Σ CONFIRMED records; outstanding = total − paid; within [0, total]. */
  intentMatchesRecords: boolean;
  /** Intent (when created) carries the immutable snapshot totals. */
  intentMatchesSnapshot: boolean;
  /** The active (ISSUED) invoice, when one exists, totals the snapshot. */
  invoiceMatchesSnapshot: boolean;
  /** Every money fact has exactly its expected ledger events — no more, no less. */
  eventsComplete: boolean;
  reconciled: boolean;
}

const countRowsFor = (ledger: FinanceSourceLedgerRow[], kind: string, sourceId: string): number =>
  ledger.filter((row) => row.kind === kind && row.sourceId === sourceId).length;

export function deriveFinanceReconciliation(source: FinanceSource): FinanceReconciliation {
  const snapshotPresent = source.snapshot !== null;

  const paidMinor = source.records
    .filter((record) => record.status === 'CONFIRMED')
    .reduce((sum, record) => sum + record.amountMinor, 0);
  const pendingOrVoidOnly = source.records.every(
    (record) => record.status === 'PENDING_CONFIRMATION' || record.status === 'VOIDED',
  );
  const expectedIntentStatus =
    source.intent === null
      ? null
      : paidMinor === 0
        ? 'OPEN'
        : paidMinor < source.intent.totalMinor
          ? 'PARTIALLY_SETTLED'
          : 'SETTLED';
  const intentMatchesRecords =
    source.intent === null
      ? pendingOrVoidOnly
      : paidMinor >= 0 &&
        paidMinor <= source.intent.totalMinor &&
        source.intent.status === expectedIntentStatus;

  const snapshot = source.snapshot;
  const intentMatchesSnapshot =
    source.intent === null ||
    (snapshot !== null &&
      source.intent.totalMinor === snapshot.totalMinor &&
      source.intent.depositMinor === snapshot.depositMinor);

  const activeInvoice = source.invoices.find((invoice) => invoice.status === 'ISSUED') ?? null;
  const invoiceMatchesSnapshot =
    activeInvoice === null || (snapshot !== null && activeInvoice.totalMinor === snapshot.totalMinor);

  const recordEvents = source.records.every((record) => {
    if (record.status === 'CONFIRMED') {
      return countRowsFor(source.ledger, 'PAYMENT_CONFIRMED', record.id) === 1;
    }
    if (record.status === 'VOIDED') {
      return countRowsFor(source.ledger, 'PAYMENT_VOIDED', record.id) === 1;
    }
    return (
      countRowsFor(source.ledger, 'PAYMENT_CONFIRMED', record.id) === 0 &&
      countRowsFor(source.ledger, 'PAYMENT_VOIDED', record.id) === 0
    );
  });
  // REFUNDED/FORFEITED hold outcomes are introduced by 09-C refund and
  // damage-settlement flows and will publish their own ledger events;
  // until then only HELD/RELEASED carries DEPOSIT_* rows (09-A).
  const holdEvents =
    source.hold === null
      ? source.ledger.every((row) => row.kind !== 'DEPOSIT_HELD' && row.kind !== 'DEPOSIT_RELEASED')
      : countRowsFor(source.ledger, 'DEPOSIT_HELD', source.hold.id) === 1 &&
        (source.hold.status === 'RELEASED'
          ? countRowsFor(source.ledger, 'DEPOSIT_RELEASED', source.hold.id) === 1
          : source.hold.status === 'HELD'
            ? countRowsFor(source.ledger, 'DEPOSIT_RELEASED', source.hold.id) === 0
            : true);
  const invoiceEvents = source.invoices.every((invoice) =>
    invoice.status === 'ISSUED'
      ? countRowsFor(source.ledger, 'INVOICE_ISSUED', invoice.id) === 1 &&
        countRowsFor(source.ledger, 'INVOICE_VOIDED', invoice.id) === 0
      : countRowsFor(source.ledger, 'INVOICE_ISSUED', invoice.id) === 1 &&
        countRowsFor(source.ledger, 'INVOICE_VOIDED', invoice.id) === 1,
  );
  const eventsComplete = recordEvents && holdEvents && invoiceEvents;

  return {
    currency: source.currency,
    snapshotPresent,
    intentMatchesRecords,
    intentMatchesSnapshot,
    invoiceMatchesSnapshot,
    eventsComplete,
    reconciled:
      snapshotPresent &&
      intentMatchesRecords &&
      intentMatchesSnapshot &&
      invoiceMatchesSnapshot &&
      eventsComplete,
  };
}
