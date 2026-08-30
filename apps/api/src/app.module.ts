import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';

/**
 * Root application module.
 *
 * Phase 01 wires configuration, the authentication boundary (01-B), user
 * identity (01-C), authorization (01-D), health endpoints and
 * logging/correlation here; domain modules are added per phase.
 */
@Module({
  imports: [ConfigModule, AuthModule, IdentityModule, AuthorizationModule, HealthModule],
})
export class AppModule {}
