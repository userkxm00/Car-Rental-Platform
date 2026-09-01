import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { AvailabilityModule } from '../availability/availability.module';
import { PricingModule } from '../pricing/pricing.module';
import { QuotesService } from './application/quotes.service';
import { QuotesRepository } from './infrastructure/quotes.repository';
import { QuotesController } from './presentation/quotes.controller';

/**
 * Quote/request module (PHASE-05 / 05-A).
 *
 * Depends on the availability module for interval validation, location
 * context and the computed availability answer. The pricing slot is filled
 * through the {@link QUOTE_PRICING_PORT} (05-A04) — the pricing engine
 * (PHASE-06 / 06-D) registers the provider in PricingModule, imported here.
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, AvailabilityModule, PricingModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuotesRepository],
})
export class QuotesModule {}
