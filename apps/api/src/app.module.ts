import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { LocationsModule } from './locations/locations.module';
import { FleetModule } from './fleet/fleet.module';
import { MediaModule } from './media/media.module';
import { MembershipsModule } from './memberships/memberships.module';
import { AvailabilityModule } from './availability/availability.module';
import { QuotesModule } from './quotes/quotes.module';
import { BookingsModule } from './bookings/bookings.module';
import { PricingModule } from './pricing/pricing.module';
import { TenantsModule } from './tenants/tenants.module';
import { CustomersModule } from './customers/customers.module';
import { SearchModule } from './search/search.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { MePortalModule } from './portal/me-portal.module';
import { DocumentsModule } from './documents/documents.module';
import { TemplatesModule } from './templates/templates.module';
import { ContractsModule } from './contracts/contracts.module';

/**
 * Root application module.
 *
 * Phase 01 wires configuration, the authentication boundary (01-B), user
 * identity (01-C), authorization (01-D) and health endpoints; Phase 02 adds
 * multi-tenancy modules here as they land (tenants, memberships, branches).
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    IdentityModule,
    AuthorizationModule,
    TenantsModule,
    MembershipsModule,
    LocationsModule,
    FleetModule,
    MediaModule,
    AvailabilityModule,
    QuotesModule,
    BookingsModule,
    PricingModule,
    CustomersModule,
    SearchModule,
    MarketplaceModule,
    MePortalModule,
    DocumentsModule,
    TemplatesModule,
    ContractsModule,
    HealthModule,
  ],
})
export class AppModule {}
