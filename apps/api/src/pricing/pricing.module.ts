import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { AvailabilityModule } from '../availability/availability.module';
import { LocationsModule } from '../locations/locations.module';
import { RatePlansService } from './application/rate-plans.service';
import { RatePlansRepository } from './infrastructure/rate-plans.repository';
import { RatePlansController } from './presentation/rate-plans.controller';
import { CommercialService } from './application/commercial.service';
import { CommercialRepository } from './infrastructure/commercial.repository';
import { CommercialController } from './presentation/commercial.controller';

/**
 * PHASE-06 pricing engine — 06-A: the rate model (plans, currency, effective
 * windows, vehicle/category applicability, duration units, deterministic
 * precedence) and its administration API (06-A07). 06-B: time rules (peak
 * windows, location hours). 06-C: commercial adjustments (promotions,
 * coupons, extras catalog, fee rules, deposit policies) with their
 * administration API. The financial-truth calculator with snapshots (06-D)
 * extends this module; the quote pricing port is registered once the engine
 * can compute (06-D).
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, AvailabilityModule, LocationsModule],
  controllers: [RatePlansController, CommercialController],
  providers: [RatePlansService, RatePlansRepository, CommercialService, CommercialRepository],
})
export class PricingModule {}
