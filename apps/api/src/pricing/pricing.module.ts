import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { AvailabilityModule } from '../availability/availability.module';
import { RatePlansService } from './application/rate-plans.service';
import { RatePlansRepository } from './infrastructure/rate-plans.repository';
import { RatePlansController } from './presentation/rate-plans.controller';

/**
 * PHASE-06 pricing engine — 06-A: the rate model (plans, currency, effective
 * windows, vehicle/category applicability, duration units, deterministic
 * precedence) and its administration API (06-A07). Time rules (06-B),
 * commercial adjustments (06-C) and the financial-truth calculator with
 * snapshots (06-D) extend this module; the quote pricing port is registered
 * once the engine can compute (06-D).
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, AvailabilityModule],
  controllers: [RatePlansController],
  providers: [RatePlansService, RatePlansRepository],
})
export class PricingModule {}
