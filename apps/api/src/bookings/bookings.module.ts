import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingsService } from './application/bookings.service';
import { BookingsRepository } from './infrastructure/bookings.repository';
import { BookingsController } from './presentation/bookings.controller';

/**
 * Booking engine module (PHASE-05 / 05-B): the booking aggregate with
 * per-tenant numbering, append-only status history, the price-snapshot
 * linkage (filled by PHASE-06) and the guard-protected inventory hold
 * (05-B05). State-machine transition commands land in 05-C.
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, AvailabilityModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository],
  exports: [BookingsService],
})
export class BookingsModule {}
