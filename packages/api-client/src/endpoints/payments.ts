import { ApiClient } from '../client';

/**
 * Typed rental-payment endpoints (PHASE-09 09-A). Mirrors
 * apps/api/src/payments/presentation/payments.controller.ts and the
 * me-portal customer surface. Amounts are integer minor units of the
 * booking currency; the server derives all totals from the immutable
 * booking price snapshot.
 */

export type PaymentIntentStatusDto = 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED';
export type PaymentMethodDto = 'CASH' | 'BANK_TRANSFER' | 'OTHER_MANUAL';
export type PaymentRecordStatusDto = 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'VOIDED';
export type DepositHoldStatusDto = 'HELD' | 'RELEASED' | 'REFUNDED' | 'FORFEITED';

export interface PaymentRecordResponseDto {
  id: string;
  method: PaymentMethodDto;
  amountMinor: number;
  reference: string | null;
  note: string | null;
  status: PaymentRecordStatusDto;
  recordedById: string | null;
  confirmedById: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface DepositHoldResponseDto {
  id: string;
  amountMinor: number;
  status: DepositHoldStatusDto;
  releasedById: string | null;
  releasedAt: string | null;
  note: string | null;
}

export interface PaymentSummaryResponseDto {
  bookingId: string;
  currency: string;
  totalMinor: number;
  depositMinor: number;
  status: PaymentIntentStatusDto;
  paidMinor: number;
  outstandingMinor: number;
  records: PaymentRecordResponseDto[];
  depositHold: DepositHoldResponseDto | null;
}

export interface PaymentRecordInputDto {
  method: PaymentMethodDto;
  amountMinor: number;
  reference?: string;
  note?: string;
}

export interface PaymentsApi {
  /** GET /agencies/:agencyId/bookings/:bookingId/payments. */
  summary(agencyId: string, bookingId: string): Promise<PaymentSummaryResponseDto>;
  /** POST /agencies/:agencyId/bookings/:bookingId/payments/records (201, pending). */
  record(
    agencyId: string,
    bookingId: string,
    input: PaymentRecordInputDto,
  ): Promise<PaymentRecordResponseDto>;
  /** POST …/records/:recordId/confirm (201; the authoritative settlement gate). */
  confirm(
    agencyId: string,
    bookingId: string,
    recordId: string,
  ): Promise<PaymentRecordResponseDto>;
  /** POST …/records/:recordId/void (201; pending records only). */
  voidRecord(
    agencyId: string,
    bookingId: string,
    recordId: string,
  ): Promise<PaymentRecordResponseDto>;
  /** POST /agencies/:agencyId/bookings/:bookingId/deposit/release (201). */
  releaseDeposit(
    agencyId: string,
    bookingId: string,
    note?: string,
  ): Promise<DepositHoldResponseDto>;
}

export interface MePaymentsApi {
  /** GET /me/bookings/:bookingId/payments (own bookings only). */
  summary(bookingId: string): Promise<PaymentSummaryResponseDto>;
}

export function createPaymentsApi(client: ApiClient): PaymentsApi {
  const base = (agencyId: string, bookingId: string) =>
    `/agencies/${agencyId}/bookings/${bookingId}/payments`;
  return {
    summary: (agencyId, bookingId) => client.get(base(agencyId, bookingId)),
    record: (agencyId, bookingId, input) => client.post(`${base(agencyId, bookingId)}/records`, input),
    confirm: (agencyId, bookingId, recordId) =>
      client.post(`${base(agencyId, bookingId)}/records/${recordId}/confirm`, {}),
    voidRecord: (agencyId, bookingId, recordId) =>
      client.post(`${base(agencyId, bookingId)}/records/${recordId}/void`, {}),
    releaseDeposit: (agencyId, bookingId, note) =>
      client.post(`/agencies/${agencyId}/bookings/${bookingId}/deposit/release`, { note }),
  };
}

export function createMePaymentsApi(client: ApiClient): MePaymentsApi {
  return {
    summary: (bookingId) => client.get(`/me/bookings/${bookingId}/payments`),
  };
}
