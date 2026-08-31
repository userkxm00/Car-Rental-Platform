import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { AvailabilityService } from './application/availability.service';
import { AvailabilityRepository } from './infrastructure/availability.repository';
import { AvailabilityController } from './presentation/availability.controller';

/**
 * Availability engine module (PHASE-04): interval model, conflict
 * protection, availability queries. Block/hold writes arrive with the
 * bookings/operations phases; the commitment guard (04-B) is the write path.
 */
@Module({
  imports: [IdentityModule, AuthorizationModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityRepository, AvailabilityService],
  exports: [AvailabilityRepository, AvailabilityService],
})
export class AvailabilityModule {}
