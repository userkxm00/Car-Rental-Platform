import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { SecurityModule } from '../security/security.module';
import { TemplatesService } from './application/templates.service';
import { TemplatesRepository } from './infrastructure/templates.repository';
import { TemplatesController } from './presentation/templates.controller';

/**
 * PHASE-08 / 08-B: versioned contract templates (append-only releases
 * per locale, ar/fr/en defaults, whitelisted substitution and effective
 * version selection). Exports {@link TemplatesService} for the contract
 * workflow (08-C) which renders through the same selection rules.
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, SecurityModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplatesRepository],
  exports: [TemplatesService],
})
export class TemplatesModule {}
