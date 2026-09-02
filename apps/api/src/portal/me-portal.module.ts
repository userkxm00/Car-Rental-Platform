import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SecurityModule } from '../security/security.module';
import { BookingsModule } from '../bookings/bookings.module';
import { QuotesModule } from '../quotes/quotes.module';
import { CustomersModule } from '../customers/customers.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { MePortalService } from './application/me-portal.service';
import { MePortalController } from './presentation/me-portal.controller';

/**
 * PHASE-07 / 07-E customer booking portal (me-surface).
 *
 * Composes the quotes, bookings, customers and marketplace modules behind
 * the authenticated non-member surface. No new persistence of its own:
 * every rule stays in its owning domain module.
 */
@Module({
  imports: [
    IdentityModule,
    SecurityModule,
    MarketplaceModule,
    QuotesModule,
    BookingsModule,
    CustomersModule,
  ],
  controllers: [MePortalController],
  providers: [MePortalService],
})
export class MePortalModule {}
