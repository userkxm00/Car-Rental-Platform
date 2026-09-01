/**
 * PHASE-06 / 06-A: rate-plan configuration contracts.
 *
 * Money values are integer minor units (architecture/pricing-engine.md):
 * `baseRateMinor` is the tenant-currency minor amount for one duration
 * unit of the plan — never a floating-point amount. Currency formatting
 * is presentation; calculation is the pricing domain (06-D).
 */

export const RatePlanErrorCode = {
  RATE_PLAN_NOT_FOUND: 'RATE_PLAN_NOT_FOUND',
  RATE_PLAN_CODE_TAKEN: 'RATE_PLAN_CODE_TAKEN',
  RATE_PLAN_CODE_INVALID: 'RATE_PLAN_CODE_INVALID',
  RATE_PLAN_NAME_INVALID: 'RATE_PLAN_NAME_INVALID',
  RATE_PLAN_CURRENCY_UNSUPPORTED: 'RATE_PLAN_CURRENCY_UNSUPPORTED',
  RATE_PLAN_UNIT_INVALID: 'RATE_PLAN_UNIT_INVALID',
  RATE_PLAN_RATE_INVALID: 'RATE_PLAN_RATE_INVALID',
  RATE_PLAN_PRECEDENCE_INVALID: 'RATE_PLAN_PRECEDENCE_INVALID',
  RATE_PLAN_WINDOW_INVALID: 'RATE_PLAN_WINDOW_INVALID',
  RATE_PLAN_SCOPE_INVALID: 'RATE_PLAN_SCOPE_INVALID',
  RATE_PLAN_SCOPE_EXCESSIVE: 'RATE_PLAN_SCOPE_EXCESSIVE',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_INACTIVE: 'CATEGORY_INACTIVE',
} as const;

export type RatePlanErrorCodeValue = (typeof RatePlanErrorCode)[keyof typeof RatePlanErrorCode];

/** 06-A05: duration units a rate plan is expressed in. */
export const RATE_DURATION_UNITS = ['HOURLY', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
export type RateDurationUnitValue = (typeof RATE_DURATION_UNITS)[number];

/**
 * 06-A02: currencies accepted for rate configuration. DZD is the R1
 * calculation currency (06-D03); the others are accepted for configuration
 * so agencies can prepare rates, but the R1 calculator refuses to price
 * them until multi-currency lands (06-D04).
 */
export const SUPPORTED_RATE_CURRENCIES = ['DZD', 'EUR', 'USD', 'MAD', 'TND'] as const;
export type RateCurrencyValue = (typeof SUPPORTED_RATE_CURRENCIES)[number];
export const R1_CALCULATION_CURRENCY: RateCurrencyValue = 'DZD';

export const RATE_PLAN_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
export const MAX_RATE_PLAN_NAME_LENGTH = 120;
/** Upper sanity bound for a single-unit minor amount (≈ 10M DZD). */
export const MAX_BASE_RATE_MINOR = 1_000_000_000;
export const MAX_RATE_PLAN_SCOPES = 50;

/** 06-A04: one scope row targets exactly one vehicle or one category. */
export interface RatePlanScopeInput {
  vehicleId?: string;
  categoryId?: string;
}

/** Raw admin input — validated at the boundary, never trusted. */
export interface RatePlanRequestInput {
  code?: string;
  name?: string;
  currency?: string;
  durationUnit?: string;
  baseRateMinor?: number;
  precedence?: number;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  active?: boolean;
  scopes?: RatePlanScopeInput[];
}

export interface RatePlanScopeResponse {
  vehicleId: string | null;
  categoryId: string | null;
}

export interface RatePlanResponse {
  ratePlanId: string;
  code: string;
  name: string;
  currency: string;
  durationUnit: RateDurationUnitValue;
  baseRateMinor: number;
  precedence: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  active: boolean;
  scopes: RatePlanScopeResponse[];
  createdAt: string;
  updatedAt: string;
}
