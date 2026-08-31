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
import { TenantsModule } from './tenants/tenants.module';

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
    HealthModule,
  ],
})
export class AppModule {}
