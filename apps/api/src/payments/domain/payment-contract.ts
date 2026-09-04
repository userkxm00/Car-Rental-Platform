/**
 * PHASE-09 / 09-A API contract: the booking payment intent, manual
 * payment records and the deposit hold. All amounts are integer minor
 * units of the booking currency (DZD for Release 1).
 */

export interface PaymentRecordInputBody {
  method: 'CASH' | 'BANK_TRANSFER' | 'OTHER_MANUAL';
  amountMinor: number;
  reference?: string;
  note?: string;
}

export interface PaymentRecordResponse {
  id: string;
  method: string;
  amountMinor: number;
  reference: string | null;
  note: string | null;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'VOIDED';
  recordedById: string | null;
  confirmedById: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface DepositHoldResponse {
  id: string;
  amountMinor: number;
  status: 'HELD' | 'RELEASED' | 'REFUNDED' | 'FORFEITED';
  releasedById: string | null;
  releasedAt: string | null;
  note: string | null;
}

export interface PaymentSummaryResponse {
  bookingId: string;
  currency: string;
  totalMinor: number;
  depositMinor: number;
  status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED';
  paidMinor: number;
  outstandingMinor: number;
  records: PaymentRecordResponse[];
  depositHold: DepositHoldResponse | null;
}
