import { createHash } from 'node:crypto';
import type { TemplateLocale } from '../../templates/domain/template-rules';

/**
 * PHASE-08 / 08-C domain rules: contract lifecycle, numbering, receipts
 * and error codes. Pure functions only — no Nest imports.
 */

// ---- statuses --------------------------------------------------------------

/** Contract issuance requires a committed booking (05-B lifecycle). */
export const CONTRACT_ISSUABLE_BOOKING_STATUSES = [
  'CONFIRMED',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_PENDING',
  'RETURNED',
  'SETTLEMENT_PENDING',
  'COMPLETED',
] as const;

export type IssuableBookingStatus = (typeof CONTRACT_ISSUABLE_BOOKING_STATUSES)[number];

export function isIssuableBookingStatus(status: string): status is IssuableBookingStatus {
  return (CONTRACT_ISSUABLE_BOOKING_STATUSES as readonly string[]).includes(status);
}

export const CONTRACT_STATUSES = ['ISSUED', 'SIGNED', 'CANCELLED'] as const;

// ---- numbering -------------------------------------------------------------

/** Human-readable, tenant-unique document numbers trace to the booking. */
export function contractNumberOf(bookingNumber: string): string {
  return `CT-${bookingNumber}`;
}

export function receiptNumberOf(bookingNumber: string): string {
  return `RT-${bookingNumber}`;
}

// ---- locales ---------------------------------------------------------------

export const CONTRACT_LOCALES: readonly TemplateLocale[] = ['ar', 'fr', 'en'];

export function resolveContractLocale(preferred: string | null | undefined): TemplateLocale {
  if (preferred && (CONTRACT_LOCALES as readonly string[]).includes(preferred)) {
    return preferred as TemplateLocale;
  }
  // Arabic first-class (08-B03): the platform default locale.
  return 'ar';
}

// ---- totals ----------------------------------------------------------------

/**
 * The booking price snapshot captured at confirmation (05-B06 / 06-A):
 * `{ currency, totalMinor, breakdown, depositMinor, calculatedAt }`.
 * Returns null when the snapshot is absent or malformed — the caller
 * refuses contract/receipt generation (docs/06: documents trace to
 * authoritative records).
 */
export interface BookingTotals {
  currency: string;
  totalMinor: number;
  depositMinor: number;
}

export function parseBookingTotals(snapshot: unknown): BookingTotals | null {
  if (snapshot === null || typeof snapshot !== 'object') {
    return null;
  }
  const record = snapshot as Record<string, unknown>;
  if (typeof record.currency !== 'string' || record.currency.length !== 3) {
    return null;
  }
  if (typeof record.totalMinor !== 'number' || !Number.isInteger(record.totalMinor) || record.totalMinor < 0) {
    return null;
  }
  const rawDeposit = record.depositMinor ?? 0;
  if (typeof rawDeposit !== 'number' || !Number.isInteger(rawDeposit) || rawDeposit < 0) {
    return null;
  }
  return { currency: record.currency, totalMinor: record.totalMinor, depositMinor: rawDeposit };
}

// ---- integrity -------------------------------------------------------------

export function contentHashOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function isValidContentHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

// ---- signature input -------------------------------------------------------

export const SIGNATURE_METHODS = ['CUSTOMER_DIGITAL', 'ON_SITE'] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

export const SIGNER_ROLES = ['CUSTOMER', 'AGENCY_REPRESENTATIVE'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export function isSignatureMethod(value: unknown): value is SignatureMethod {
  return typeof value === 'string' && (SIGNATURE_METHODS as readonly string[]).includes(value);
}

export function isSignerRole(value: unknown): value is SignerRole {
  return typeof value === 'string' && (SIGNER_ROLES as readonly string[]).includes(value);
}

export const SIGNER_NAME_MAX = 160;
export const SIGNATURE_NOTE_MAX = 500;

// ---- built-in receipt content (08-C05) -------------------------------------

/**
 * Localized rental-agreement receipt bodies. Receipts are not
 * template-configurable in R1; they render with the shared 08-B06
 * substitution engine so money/dates format exactly like contracts.
 * Only whitelisted template variables are referenced.
 */
export const RECEIPT_CONTENT: Record<TemplateLocale, { title: string; body: string }> = {
  ar: {
    title: 'إيصال عقد الإيجار',
    body: `{{AGENCY_NAME}}
إيصال عقد الإيجار

رقم الحجز: {{BOOKING_NUMBER}}
رقم العقد: {{CONTRACT_NUMBER}}
تاريخ الإصدار: {{CONTRACT_DATE}}

المستأجر: {{CUSTOMER_FIRST_NAME}} {{CUSTOMER_LAST_NAME}}
المركبة: {{VEHICLE_MAKE}} {{VEHICLE_MODEL}} ({{VEHICLE_YEAR}}) — اللوحة {{VEHICLE_PLATE}}
الاستلام: {{PICKUP_BRANCH_NAME}} بتاريخ {{PICKUP_DATE}} على الساعة {{PICKUP_TIME}}
الإرجاع: {{RETURN_BRANCH_NAME}} بتاريخ {{RETURN_DATE}} على الساعة {{RETURN_TIME}}
المدة: {{RENTAL_DAYS}} يومًا

مبلغ الإيجار: {{RENTAL_AMOUNT}} {{CURRENCY}}
مبلغ الضمان: {{DEPOSIT_AMOUNT}} {{CURRENCY}}

يرتبط هذا الإيصال بالحجز رقم {{BOOKING_NUMBER}} وعقد الإيجار الخاص به.
تُسجَّل المدفوعات ضمن السجل المالي للحجز.`,
  },
  fr: {
    title: 'Reçu du contrat de location',
    body: `{{AGENCY_NAME}}
Reçu du contrat de location

N° de réservation : {{BOOKING_NUMBER}}
N° de contrat : {{CONTRACT_NUMBER}}
Émis le : {{CONTRACT_DATE}}

Locataire : {{CUSTOMER_FIRST_NAME}} {{CUSTOMER_LAST_NAME}}
Véhicule : {{VEHICLE_MAKE}} {{VEHICLE_MODEL}} ({{VEHICLE_YEAR}}) — immatriculation {{VEHICLE_PLATE}}
Prise en charge : {{PICKUP_BRANCH_NAME}} le {{PICKUP_DATE}} à {{PICKUP_TIME}}
Restitution : {{RETURN_BRANCH_NAME}} le {{RETURN_DATE}} à {{RETURN_TIME}}
Durée : {{RENTAL_DAYS}} jour(s)

Montant de la location : {{RENTAL_AMOUNT}} {{CURRENCY}}
Caution : {{DEPOSIT_AMOUNT}} {{CURRENCY}}

Ce reçu est rattaché à la réservation {{BOOKING_NUMBER}} et à son contrat de location.
Les paiements sont enregistrés dans le registre financier de la réservation.`,
  },
  en: {
    title: 'Rental agreement receipt',
    body: `{{AGENCY_NAME}}
Rental agreement receipt

Booking number: {{BOOKING_NUMBER}}
Contract number: {{CONTRACT_NUMBER}}
Issued on: {{CONTRACT_DATE}}

Customer: {{CUSTOMER_FIRST_NAME}} {{CUSTOMER_LAST_NAME}}
Vehicle: {{VEHICLE_MAKE}} {{VEHICLE_MODEL}} ({{VEHICLE_YEAR}}) — plate {{VEHICLE_PLATE}}
Pickup: {{PICKUP_BRANCH_NAME}} on {{PICKUP_DATE}} at {{PICKUP_TIME}}
Return: {{RETURN_BRANCH_NAME}} on {{RETURN_DATE}} at {{RETURN_TIME}}
Duration: {{RENTAL_DAYS}} day(s)

Rental amount: {{RENTAL_AMOUNT}} {{CURRENCY}}
Security deposit: {{DEPOSIT_AMOUNT}} {{CURRENCY}}

This receipt traces to booking {{BOOKING_NUMBER}} and its rental contract.
Payments are recorded against the booking ledger.`,
  },
};

// ---- error codes -----------------------------------------------------------

export const ContractsErrorCode = {
  CONTRACT_BOOKING_NOT_FOUND: 'CONTRACT_BOOKING_NOT_FOUND',
  CONTRACT_NOT_FOUND: 'CONTRACT_NOT_FOUND',
  CONTRACT_EXISTS: 'CONTRACT_EXISTS',
  CONTRACT_BOOKING_NOT_ISSUABLE: 'CONTRACT_BOOKING_NOT_ISSUABLE',
  CONTRACT_CUSTOMER_MISSING: 'CONTRACT_CUSTOMER_MISSING',
  CONTRACT_AGENCY_NAME_MISSING: 'CONTRACT_AGENCY_NAME_MISSING',
  CONTRACT_LICENSE_MISSING: 'CONTRACT_LICENSE_MISSING',
  CONTRACT_VEHICLE_MISSING: 'CONTRACT_VEHICLE_MISSING',
  CONTRACT_BRANCH_MISSING: 'CONTRACT_BRANCH_MISSING',
  CONTRACT_AGENCY_CONTACT_MISSING: 'CONTRACT_AGENCY_CONTACT_MISSING',
  CONTRACT_PRICING_MISSING: 'CONTRACT_PRICING_MISSING',
  CONTRACT_LOCALE_INVALID: 'CONTRACT_LOCALE_INVALID',
  SIGNATURE_INPUT_INVALID: 'SIGNATURE_INPUT_INVALID',
  SIGNATURE_EXISTS: 'SIGNATURE_EXISTS',
  RECEIPT_CONTRACT_MISSING: 'RECEIPT_CONTRACT_MISSING',
  RECEIPT_EXISTS: 'RECEIPT_EXISTS',
  RECEIPT_NOT_FOUND: 'RECEIPT_NOT_FOUND',
  CONTRACT_DOCUMENT_NOT_FOUND: 'CONTRACT_DOCUMENT_NOT_FOUND',
} as const;

export type ContractsErrorCodeValue = (typeof ContractsErrorCode)[keyof typeof ContractsErrorCode];
