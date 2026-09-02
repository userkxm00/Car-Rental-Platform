import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PricingModule } from '../pricing/pricing.module';
import { SecurityModule } from '../security/security.module';
import { SearchService } from './application/search.service';
import { MarketplaceRepository } from './infrastructure/marketplace.repository';
import { SearchController } from './presentation/search.controller';

/**
 * PHASE-07 / 07-B marketplace search.
 *
 * Public cross-agency discovery: participating agencies (07-B07) ×
 * location-constrained pickup points (07-B02) × interval eligibility via
 * each agency's own availability engine (07-B03/B08) × server-computed
 * pricing through the pricing port (07-B05) × attribute filters
 * (07-B04/B06) with deterministic ordering and pagination (07-B10).
 */
@Module({
  imports: [AvailabilityModule, PricingModule, SecurityModule],
  controllers: [SearchController],
  providers: [SearchService, MarketplaceRepository],
  exports: [SearchService],
})
export class SearchModule {}
