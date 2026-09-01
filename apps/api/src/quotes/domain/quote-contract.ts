import type { AvailabilityReason } from '../../availability/domain/availability-query';

/**
 * Quote request/response contract (05-A01/A06).
 *
 * A quote is a calculated, expiring offer (architecture/domain-model.md):
 * it captures the agency, the vehicle/offer target, the requested interval
 * and locations, and the server-computed availability answer — persisted as
 * an immutable record for audit and customer visibility. A booking (05-B)
 * is the committed record; confirming re-checks availability and pricing.
 *
 * Pricing integration boundary (05-A04): quotes carry a `pricing` slot
 * computed through the {@link QuotePricingPort}; it is `null` until the
 * pricing engine (PHASE-06) registers a provider. A quote without a price
 * must never be treated as a priced offer, and an expired quote must never
 * be silently treated as a current price (docs/06-business-rules.md).
 */

export const QuoteErrorCode = {
  /** Interval boundary errors (shared with 04-A). */
  INVALID_INTERVAL: 'INVALID_INTERVAL',
  /** Pickup instant must lie in the future (05-A02 eligibility). */
  INTERVAL_IN_PAST: 'INTERVAL_IN_PAST',
  /** Neither vehicleId nor categoryId was provided. */
  QUOTE_TARGET_REQUIRED: 'QUOTE_TARGET_REQUIRED',
  /** Both vehicleId and categoryId were provided — exactly one is allowed. */
  QUOTE_TARGET_EXCLUSIVE: 'QUOTE_TARGET_EXCLUSIVE',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  /** Category exists in the tenant but is not active. */
  CATEGORY_INACTIVE: 'CATEGORY_INACTIVE',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  DELIVERY_ZONE_NOT_FOUND: 'DELIVERY_ZONE_NOT_FOUND',
  QUOTE_NOT_FOUND: 'QUOTE_NOT_FOUND',
  INVALID_CHANNEL: 'INVALID_CHANNEL',
} as const;

export type QuoteErrorCodeValue = (typeof QuoteErrorCode)[keyof typeof QuoteErrorCode];

/** Booking channels (docs/11: every mode uses the same core rules). */
export const QUOTE_CHANNELS = [
  'MARKETPLACE',
  'AGENCY_WEB',
  'STAFF',
  'PHONE',
  'WALK_IN',
  'IMPORT',
] as const;
export type QuoteChannel = (typeof QUOTE_CHANNELS)[number];

/** Inventory target: a physical vehicle or a category (assigned later). */
export const QuoteInventoryMode = {
  VEHICLE: 'VEHICLE',
  CATEGORY: 'CATEGORY',
} as const;
export type QuoteInventoryModeValue = (typeof QuoteInventoryMode)[keyof typeof QuoteInventoryMode];

/** Raw client input — validated at the boundary, never trusted. */
export interface QuoteRequestInput {
  channel?: string;
  vehicleId?: string;
  categoryId?: string;
  start?: string;
  end?: string;
  pickupBranchId?: string;
  returnBranchId?: string;
  deliveryZoneId?: string;
}

/** Validated, typed request after boundary validation. */
export interface ValidatedQuoteRequest {
  channel: QuoteChannel;
  mode: QuoteInventoryModeValue;
  vehicleId: string | null;
  categoryId: string | null;
  start: Date;
  end: Date;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
}

/** Availability answer inside a quote (mirrors the 04-C contracts). */
export type QuoteAvailability =
  | { mode: 'VEHICLE'; available: boolean; reasons: AvailabilityReason[] }
  | { mode: 'CATEGORY'; eligible: number; committed: number; availableCount: number };

/** Pricing slot — the 05-A04 boundary payload (null until PHASE-06). */
export interface QuotePricingPayload {
  currency: string;
  totalMinor: number;
  /** Itemized signed components of the total (integer minor units). */
  breakdown: Array<{ code: string; amountMinor: number }>;
  /**
   * Deposit requirement tracked separately from the total
   * (06-C08/06-D06); null when no deposit policy applies.
   */
  depositMinor: number | null;
  calculatedAt: string;
}

/** Quote response contract (05-A06). */
export interface QuoteResponse {
  quoteId: string;
  channel: QuoteChannel;
  createdAt: string;
  expiresAt: string;
  /** True once now > expiresAt; an expired quote is never a current price. */
  expired: boolean;
  request: {
    start: string;
    end: string;
    mode: QuoteInventoryModeValue;
    vehicleId: string | null;
    categoryId: string | null;
    pickupBranchId: string | null;
    returnBranchId: string | null;
    deliveryZoneId: string | null;
  };
  availability: QuoteAvailability;
  pricing: QuotePricingPayload | null;
}
