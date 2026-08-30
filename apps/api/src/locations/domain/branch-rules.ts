/**
 * Branch/location domain rules (02-C).
 */
export const BranchErrorCode = {
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  LOCATION_NOT_FOUND: 'LOCATION_NOT_FOUND',
  LOCATION_TENANT_MISMATCH: 'LOCATION_TENANT_MISMATCH',
  BRANCH_CODE_TAKEN: 'BRANCH_CODE_TAKEN',
  BRANCH_VALIDATION_FAILED: 'BRANCH_VALIDATION_FAILED',
  HOURS_VALIDATION_FAILED: 'HOURS_VALIDATION_FAILED',
  ZONE_VALIDATION_FAILED: 'ZONE_VALIDATION_FAILED',
} as const;

export type BranchErrorCodeValue = (typeof BranchErrorCode)[keyof typeof BranchErrorCode];

/** Branch codes are uppercase alphanumerics/dashes (02-C03). */
export const BRANCH_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const BRANCH_CODE_MIN = 2;
export const BRANCH_CODE_MAX = 20;
export const NAME_MAX = 120;

/** 24h HH:MM (02-C04/05). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ISO-8601 day numbering: 0=Monday … 6=Sunday. */
export const DAY_OF_WEEK_MIN = 0;
export const DAY_OF_WEEK_MAX = 6;

export interface BranchContacts {
  phone?: string;
  email?: string;
  whatsapp?: string;
  notes?: string;
}

export function isValidBranchCode(code: string): boolean {
  return (
    code.length >= BRANCH_CODE_MIN &&
    code.length <= BRANCH_CODE_MAX &&
    BRANCH_CODE_PATTERN.test(code)
  );
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function isValidDayOfWeek(day: number): boolean {
  return Number.isInteger(day) && day >= DAY_OF_WEEK_MIN && day <= DAY_OF_WEEK_MAX;
}

/** Recurring hours must open before they close. */
export function isOpenBeforeClose(opensAt: string, closesAt: string): boolean {
  return opensAt < closesAt;
}

export function isValidContacts(contacts: unknown): contacts is BranchContacts {
  if (contacts === null || contacts === undefined) {
    return true;
  }
  if (typeof contacts !== 'object' || Array.isArray(contacts)) {
    return false;
  }
  const allowed = new Set(['phone', 'email', 'whatsapp', 'notes']);
  return Object.keys(contacts).every((key) => allowed.has(key));
}
