import type { TemplateValues } from '../../templates/domain/template-rules';
import { ContractsErrorCode } from './contracts.rules';
import { parseBookingTotals, type BookingTotals } from './contracts.rules';

/**
 * 08-C02 value assembly: booking/customer/vehicle/branch rows → the
 * template substitution values for the contract snapshot. Pure and
 * deterministic — the exact same inputs always produce the same values,
 * which is what makes historical contracts reproducible (08-C07).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ContractValuesContext {
  tenant: { name: string | null };
  booking: {
    bookingNumber: string;
    currency: string;
    startsAt: Date;
    endsAt: Date;
  };
  customer: {
    firstName: string | null;
    lastName: string | null;
    preferredLocale: string | null;
    licenseNumber: string | null;
    licenseCountry: string | null;
  } | null;
  vehicle: {
    make: string | null;
    model: string | null;
    year: number | null;
    plateNumber: string | null;
  } | null;
  pickupBranch: { name: string | null; contacts: unknown } | null;
  returnBranch: { name: string | null; contacts: unknown } | null;
  /** The VERIFIED DRIVER_LICENSE record — authoritative over customer fields. */
  verifiedLicense: { number: string | null } | null;
  /** booking_price_snapshots.pricingJson at confirmation (05-B06). */
  priceSnapshot: unknown;
}

export interface ContractValueFailure {
  variable: keyof TemplateValues;
  code: string;
}

export interface ContractValuesResult {
  values: TemplateValues;
  totals: BookingTotals | null;
  failures: ContractValueFailure[];
}

interface BranchContactsLike {
  phone?: unknown;
}

function branchPhone(contacts: unknown): string | null {
  if (contacts === null || typeof contacts !== 'object') {
    return null;
  }
  const phone = (contacts as BranchContactsLike).phone;
  return typeof phone === 'string' && phone.trim().length > 0 ? phone.trim() : null;
}

function textOf(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function fail(failures: ContractValueFailure[], variable: keyof TemplateValues, code: string): null {
  failures.push({ variable, code });
  return null;
}

/** Whole rental days, rounded up (a partial day is a full rental day). */
export function rentalDaysOf(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
}

export function buildContractValues(context: ContractValuesContext): ContractValuesResult {
  const failures: ContractValueFailure[] = [];
  const values: TemplateValues = {};

  const totals = parseBookingTotals(context.priceSnapshot);
  const licenseNumber =
    textOf(context.verifiedLicense?.number ?? null) ?? textOf(context.customer?.licenseNumber ?? null);
  const licenseCountry = textOf(context.customer?.licenseCountry ?? null);
  const agencyPhone = context.pickupBranch ? branchPhone(context.pickupBranch.contacts) : null;

  // Identifiers and parties.
  values.AGENCY_NAME =
    textOf(context.tenant.name) ?? fail(failures, 'AGENCY_NAME', ContractsErrorCode.CONTRACT_AGENCY_NAME_MISSING);
  values.AGENCY_PHONE = agencyPhone ?? fail(failures, 'AGENCY_PHONE', ContractsErrorCode.CONTRACT_AGENCY_CONTACT_MISSING);
  values.BOOKING_NUMBER = textOf(context.booking.bookingNumber) ?? fail(failures, 'BOOKING_NUMBER', ContractsErrorCode.CONTRACT_BOOKING_NOT_FOUND);

  // Customer + license (verified document first — 08-A authority).
  if (!context.customer) {
    values.CUSTOMER_FIRST_NAME = fail(failures, 'CUSTOMER_FIRST_NAME', ContractsErrorCode.CONTRACT_CUSTOMER_MISSING);
    values.CUSTOMER_LAST_NAME = fail(failures, 'CUSTOMER_LAST_NAME', ContractsErrorCode.CONTRACT_CUSTOMER_MISSING);
  } else {
    values.CUSTOMER_FIRST_NAME =
      textOf(context.customer.firstName) ?? fail(failures, 'CUSTOMER_FIRST_NAME', ContractsErrorCode.CONTRACT_CUSTOMER_MISSING);
    values.CUSTOMER_LAST_NAME =
      textOf(context.customer.lastName) ?? fail(failures, 'CUSTOMER_LAST_NAME', ContractsErrorCode.CONTRACT_CUSTOMER_MISSING);
  }
  values.CUSTOMER_LICENSE_NUMBER =
    licenseNumber ?? fail(failures, 'CUSTOMER_LICENSE_NUMBER', ContractsErrorCode.CONTRACT_LICENSE_MISSING);
  values.CUSTOMER_LICENSE_COUNTRY =
    licenseCountry ?? fail(failures, 'CUSTOMER_LICENSE_COUNTRY', ContractsErrorCode.CONTRACT_LICENSE_MISSING);

  // Vehicle.
  if (!context.vehicle) {
    values.VEHICLE_MAKE = fail(failures, 'VEHICLE_MAKE', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
    values.VEHICLE_MODEL = fail(failures, 'VEHICLE_MODEL', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
    values.VEHICLE_YEAR = fail(failures, 'VEHICLE_YEAR', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
    values.VEHICLE_PLATE = fail(failures, 'VEHICLE_PLATE', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
  } else {
    values.VEHICLE_MAKE = textOf(context.vehicle.make) ?? fail(failures, 'VEHICLE_MAKE', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
    values.VEHICLE_MODEL = textOf(context.vehicle.model) ?? fail(failures, 'VEHICLE_MODEL', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
    values.VEHICLE_YEAR = context.vehicle.year ?? fail(failures, 'VEHICLE_YEAR', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
    values.VEHICLE_PLATE =
      textOf(context.vehicle.plateNumber) ?? fail(failures, 'VEHICLE_PLATE', ContractsErrorCode.CONTRACT_VEHICLE_MISSING);
  }

  // Branches.
  values.PICKUP_BRANCH_NAME =
    textOf(context.pickupBranch?.name ?? null) ?? fail(failures, 'PICKUP_BRANCH_NAME', ContractsErrorCode.CONTRACT_BRANCH_MISSING);
  values.RETURN_BRANCH_NAME =
    textOf(context.returnBranch?.name ?? null) ?? fail(failures, 'RETURN_BRANCH_NAME', ContractsErrorCode.CONTRACT_BRANCH_MISSING);

  // Interval.
  values.PICKUP_DATE = context.booking.startsAt;
  values.PICKUP_TIME = context.booking.startsAt;
  values.RETURN_DATE = context.booking.endsAt;
  values.RETURN_TIME = context.booking.endsAt;
  values.RENTAL_DAYS = rentalDaysOf(context.booking.startsAt, context.booking.endsAt);

  // Money.
  values.CURRENCY = totals?.currency ?? textOf(context.booking.currency) ?? 'DZD';
  if (!totals) {
    values.RENTAL_AMOUNT = fail(failures, 'RENTAL_AMOUNT', ContractsErrorCode.CONTRACT_PRICING_MISSING);
    values.DEPOSIT_AMOUNT = fail(failures, 'DEPOSIT_AMOUNT', ContractsErrorCode.CONTRACT_PRICING_MISSING);
  } else {
    values.RENTAL_AMOUNT = totals.totalMinor;
    // No deposit configured → 0 (truthful: nothing held).
    values.DEPOSIT_AMOUNT = totals.depositMinor;
  }

  return { values, totals, failures };
}
