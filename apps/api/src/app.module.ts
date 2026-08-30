import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
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
    HealthModule,
  ],
})
export class AppModule {}
