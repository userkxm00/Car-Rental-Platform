/**
 * Fleet domain rules (03-A/03-B).
 */
export const FleetErrorCode = {
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_CODE_TAKEN: 'CATEGORY_CODE_TAKEN',
  CATEGORY_VALIDATION_FAILED: 'CATEGORY_VALIDATION_FAILED',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  VEHICLE_PLATE_TAKEN: 'VEHICLE_PLATE_TAKEN',
  VEHICLE_VALIDATION_FAILED: 'VEHICLE_VALIDATION_FAILED',
  INVALID_VEHICLE_STATUS_TRANSITION: 'INVALID_VEHICLE_STATUS_TRANSITION',
} as const;

export type FleetErrorCodeValue = (typeof FleetErrorCode)[keyof typeof FleetErrorCode];

export const TRANSMISSION_TYPES = ['MANUAL', 'AUTOMATIC'] as const;
export type TransmissionType = (typeof TRANSMISSION_TYPES)[number];

export const FUEL_TYPES = ['PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'LPG'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

/** Category codes: uppercase alphanumerics/dashes. */
export const CATEGORY_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const CATEGORY_CODE_MIN = 2;
export const CATEGORY_CODE_MAX = 24;

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 2000;

export const SEATS_MIN = 1;
export const SEATS_MAX = 50;
export const DOORS_MIN = 1;
export const DOORS_MAX = 10;
export const LUGGAGE_MIN = 0;
export const LUGGAGE_MAX = 30;

/** Vehicle rules (03-B02). */
export const PLATE_PATTERN = /^[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12})?$/;
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const YEAR_MIN = 1980;
export const YEAR_MAX = new Date().getFullYear() + 1;
export const MAKE_MODEL_MAX = 60;

export function isValidCategoryCode(code: string): boolean {
  return (
    code.length >= CATEGORY_CODE_MIN &&
    code.length <= CATEGORY_CODE_MAX &&
    CATEGORY_CODE_PATTERN.test(code)
  );
}

export function isValidPlate(plate: string): boolean {
  return PLATE_PATTERN.test(plate) && plate.length <= 14;
}

export function isValidVin(vin: string): boolean {
  return VIN_PATTERN.test(vin);
}

export function isValidModelYear(year: number): boolean {
  return Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX;
}
