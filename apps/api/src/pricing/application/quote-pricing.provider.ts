import { ConflictException, Injectable } from '@nestjs/common';
import {
  QUOTE_PRICING_NOT_CONFIGURED_CODE,
  type QuotePricingInput,
  type QuotePricingPort,
} from '../../quotes/application/ports/quote-pricing.port';
import type { QuotePricingPayload } from '../../quotes/domain/quote-contract';
import { BranchesService } from '../../locations/application/branches.service';
import { LocationsRepository } from '../../locations/infrastructure/locations.repository';
import { CommercialRepository } from '../infrastructure/commercial.repository';
import { RatePlansRepository } from '../infrastructure/rate-plans.repository';
import {
  calculateQuote,
  NoPricingConfigurationError,
  type BranchPointInput,
} from '../domain/quote-calculator';

/**
 * PHASE-06 / 06-D06: the {@link QuotePricingPort} implementation. It
 * gathers the tenant's active pricing configuration (rate plans,
 * promotions, fee rules, deposit policies) and branch context (timezone,
 * coordinates, location hours) and runs the pure {@link calculateQuote}
 * pipeline — server-authoritative, deterministic, integer-minor totals.
 *
 * When no rate plan applies the provider throws the stable
 * {@link QUOTE_PRICING_NOT_CONFIGURED_CODE} conflict; the quote flow maps
 * it to `pricing: null` (unpriced = not bookable-as-priced).
 */

/** R1: tenants default to Africa/Algiers until tenant settings exist. */
const R1_TENANT_TIMEZONE = 'Africa/Algiers';

@Injectable()
export class QuotePricingProvider implements QuotePricingPort {
  constructor(
    private readonly plans: RatePlansRepository,
    private readonly commercial: CommercialRepository,
    private readonly branches: BranchesService,
    private readonly locations: LocationsRepository,
  ) {}

  async computeQuotePricing(input: QuotePricingInput): Promise<QuotePricingPayload> {
    const now = new Date();
    const [planRows, promotions, feeRules, depositPolicies, pickupBranch, returnBranch] =
      await Promise.all([
        this.plans.listActiveCandidates(input.tenantId),
        this.commercial.listActivePromotionCandidates(input.tenantId),
        this.commercial.listActiveFeeRuleCandidates(input.tenantId),
        this.commercial.listDepositPolicies(input.tenantId),
        this.loadBranch(input.tenantId, input.pickupBranchId),
        this.loadBranch(input.tenantId, input.returnBranchId),
      ]);

    try {
      const result = calculateQuote({
        now,
        start: input.start,
        end: input.end,
        vehicleId: input.vehicleId ?? null,
        categoryId: input.categoryId ?? null,
        pickupBranchId: input.pickupBranchId ?? null,
        returnBranchId: input.returnBranchId ?? null,
        deliveryZoneId: input.deliveryZoneId ?? null,
        pickupBranch,
        returnBranch,
        tenantTimezone: R1_TENANT_TIMEZONE,
        plans: planRows,
        promotions,
        feeRules,
        depositPolicies,
      });
      return {
        currency: result.currency,
        totalMinor: result.totalMinor,
        breakdown: result.lines,
        depositMinor: result.depositMinor,
        calculatedAt: now.toISOString(),
      };
    } catch (error) {
      if (error instanceof NoPricingConfigurationError) {
        throw new ConflictException({
          code: QUOTE_PRICING_NOT_CONFIGURED_CODE,
          message: 'No active rate plan applies to this quote.',
        });
      }
      throw error;
    }
  }

  private async loadBranch(
    tenantId: string,
    branchId: string | undefined,
  ): Promise<BranchPointInput | null> {
    if (!branchId) {
      return null;
    }
    const branch = await this.branches.getBranch(tenantId, branchId).catch(() => null);
    if (!branch) {
      return null;
    }
    const location = await this.locations.findLocation(branch.locationId);
    const hours = await this.locations.listHours(branch.locationId);
    return {
      branchId: branch.id,
      timezone: branch.timezone,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      hours: hours.map((row) => ({
        dayOfWeek: row.dayOfWeek,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
      })),
    };
  }
}
