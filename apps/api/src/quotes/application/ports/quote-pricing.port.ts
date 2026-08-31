import type { QuotePricingPayload } from '../../domain/quote-contract';

/**
 * Pricing integration boundary (05-A04).
 *
 * The pricing engine is PHASE-06 (rate model → time rules → commercial
 * adjustments → financial truth). The quote flow depends only on this port,
 * never on pricing internals, so the engine plugs in as a provider without
 * changing the quote contract. Money rules (server-authoritative totals,
 * deterministic calculation, centralized rounding — architecture/
 * pricing-engine.md) are the port's responsibility once implemented.
 *
 * Until PHASE-06 registers a provider, quotes are created with
 * `pricing: null`; consumers must treat an unpriced quote as not bookable,
 * and an expired quote as never current (docs/06-business-rules.md).
 */
export const QUOTE_PRICING_PORT = Symbol('KAVRIQO_QUOTE_PRICING_PORT');

export interface QuotePricingInput {
  tenantId: string;
  mode: 'VEHICLE' | 'CATEGORY';
  vehicleId?: string;
  categoryId?: string;
  start: Date;
  end: Date;
  pickupBranchId?: string;
  returnBranchId?: string;
  deliveryZoneId?: string;
}

export interface QuotePricingPort {
  /**
   * Computes the authoritative quote price for the validated request.
   * Implementations must be deterministic for identical inputs and must
   * throw a stable business error when no pricing applies.
   */
  computeQuotePricing(input: QuotePricingInput): Promise<QuotePricingPayload>;
}
