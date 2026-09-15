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
