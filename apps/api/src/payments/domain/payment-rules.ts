import { MAX_MONEY_MINOR } from '../../pricing/domain/money';

/**
 * PHASE-09 / 09-A domain rules: the payment intent state machine,
 * manual payment records and the deposit hold lifecycle. Pure functions
 * only — no Nest imports. Money stays in integer minor units.
 */

// ---- booking eligibility ---------------------------------------------------

/**
 * Payments apply to committed bookings only (09-A04): the booking must be
 * past confirmation and must not be cancelled.
 */
export const PAYMENT_ELIGIBLE_BOOKING_STATUSES = [
  'CONFIRMED',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_PENDING',
  'RETURNED',
  'SETTLEMENT_PENDING',
  'COMPLETED',
] as const;

export type PaymentEligibleBookingStatus = (typeof PAYMENT_ELIGIBLE_BOOKING_STATUSES)[number];

export function isPaymentEligibleStatus(status: string): status is PaymentEligibleBookingStatus {
  return (PAYMENT_ELIGIBLE_BOOKING_STATUSES as readonly string[]).includes(status);
}

// ---- methods and statuses --------------------------------------------------

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'OTHER_MANUAL'] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethodValue {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export const RECORD_STATUSES = ['PENDING_CONFIRMATION', 'CONFIRMED', 'VOIDED'] as const;
export type PaymentRecordStatusValue = (typeof RECORD_STATUSES)[number];

export const INTENT_STATUSES = ['OPEN', 'PARTIALLY_SETTLED', 'SETTLED'] as const;
export type PaymentIntentStatusValue = (typeof INTENT_STATUSES)[number];

export const DEPOSIT_HOLD_STATUSES = ['HELD', 'RELEASED', 'REFUNDED', 'FORFEITED'] as const;
export type DepositHoldStatusValue = (typeof DEPOSIT_HOLD_STATUSES)[number];

// ---- intent state (09-A01/09-A04) ------------------------------------------

/**
 * The financial state is a pure projection of the confirmed records
 * against the immutable snapshot total (docs/06: balances derive from
 * authoritative transaction records, never from a mutable counter).
 */
export function computeIntentStatus(
  confirmedMinor: number,
  totalMinor: number,
): PaymentIntentStatusValue {
  if (confirmedMinor <= 0) {
    return 'OPEN';
  }
  return confirmedMinor >= totalMinor ? 'SETTLED' : 'PARTIALLY_SETTLED';
}

/** Outstanding rental balance (never negative). */
export function outstandingMinor(confirmedMinor: number, totalMinor: number): number {
  return Math.max(0, totalMinor - confirmedMinor);
}

// ---- input validation ------------------------------------------------------

export const PAYMENT_NOTE_MAX = 500;
export const PAYMENT_REFERENCE_MAX = 120;

export interface PaymentRecordInput {
  method: PaymentMethodValue;
  amountMinor: number;
  reference: string | null;
  note: string | null;
}

/**
 * 09-A02/09-A03: validates a manual payment record. Bank transfers
 * require a reference (evidence), cash/other-manual take an optional
 * note. Amounts are positive integer minor units within the money cap.
 */
export function validatePaymentRecordInput(input: unknown): PaymentRecordInput | null {
  if (input === null || typeof input !== 'object') {
    return null;
  }
  const candidate = input as {
    method?: unknown;
    amountMinor?: unknown;
    reference?: unknown;
    note?: unknown;
  };
  if (!isPaymentMethod(candidate.method)) {
    return null;
  }
  const amount = candidate.amountMinor;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_MONEY_MINOR) {
    return null;
  }
  if (candidate.reference !== undefined && candidate.reference !== null && typeof candidate.reference !== 'string') {
    return null;
  }
  if (candidate.note !== undefined && candidate.note !== null && typeof candidate.note !== 'string') {
    return null;
  }
  const reference =
    candidate.reference === undefined || candidate.reference === null
      ? null
      : candidate.reference.trim();
  const note =
    candidate.note === undefined || candidate.note === null ? null : candidate.note.trim();
  if (candidate.method === 'BANK_TRANSFER') {
    if (reference === null || reference.length === 0 || reference.length > PAYMENT_REFERENCE_MAX) {
      return null;
    }
  }
  if (reference !== null && reference.length > PAYMENT_REFERENCE_MAX) {
    return null;
  }
  if (note !== null && note.length > PAYMENT_NOTE_MAX) {
    return null;
  }
  return { method: candidate.method, amountMinor: amount, reference, note };
}

// ---- deposit release (09-A06) -----------------------------------------------

/** The deposit can only release once the rental has returned. */
export const DEPOSIT_RELEASABLE_BOOKING_STATUSES = [
  'RETURNED',
  'SETTLEMENT_PENDING',
  'COMPLETED',
] as const;

export function isDepositReleasableStatus(status: string): boolean {
  return (DEPOSIT_RELEASABLE_BOOKING_STATUSES as readonly string[]).includes(status);
}

// ---- error codes ------------------------------------------------------------

export const PaymentsErrorCode = {
  PAYMENT_BOOKING_NOT_FOUND: 'PAYMENT_BOOKING_NOT_FOUND',
  PAYMENT_BOOKING_NOT_ELIGIBLE: 'PAYMENT_BOOKING_NOT_ELIGIBLE',
  PAYMENT_PRICING_MISSING: 'PAYMENT_PRICING_MISSING',
  PAYMENT_RECORD_NOT_FOUND: 'PAYMENT_RECORD_NOT_FOUND',
  PAYMENT_RECORD_INPUT_INVALID: 'PAYMENT_RECORD_INPUT_INVALID',
  PAYMENT_RECORD_STATE: 'PAYMENT_RECORD_STATE',
  PAYMENT_EXCEEDS_OUTSTANDING: 'PAYMENT_EXCEEDS_OUTSTANDING',
  PAYMENT_DEPOSIT_MISSING: 'PAYMENT_DEPOSIT_MISSING',
  PAYMENT_DEPOSIT_STATE: 'PAYMENT_DEPOSIT_STATE',
  PAYMENT_DEPOSIT_NOT_RELEASABLE: 'PAYMENT_DEPOSIT_NOT_RELEASABLE',
} as const;

export type PaymentsErrorCodeValue = (typeof PaymentsErrorCode)[keyof typeof PaymentsErrorCode];
