/**
 * Strict parsing of the immutable booking price snapshot totals
 * (05-B06). One canonical implementation shared by every consumer —
 * contracts (08-C receipts), payments (09-A) and billing (09-B) — so
 * the money semantics never drift between modules.
 */

export interface BookingTotals {
  currency: string;
  totalMinor: number;
  depositMinor: number;
}

/** Returns null for any malformed snapshot; amounts are integer minor units. */
export function parseBookingTotals(snapshot: unknown): BookingTotals | null {
  if (snapshot === null || typeof snapshot !== 'object') {
    return null;
  }
  const record = snapshot as Record<string, unknown>;
  if (typeof record.currency !== 'string' || record.currency.length !== 3) {
    return null;
  }
  if (
    typeof record.totalMinor !== 'number' ||
    !Number.isInteger(record.totalMinor) ||
    record.totalMinor < 0
  ) {
    return null;
  }
  const rawDeposit = record.depositMinor ?? 0;
  if (typeof rawDeposit !== 'number' || !Number.isInteger(rawDeposit) || rawDeposit < 0) {
    return null;
  }
  return { currency: record.currency, totalMinor: record.totalMinor, depositMinor: rawDeposit };
}
