import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { SecurityModule } from '../security/security.module';
import { TemplatesModule } from '../templates/templates.module';
import { ContractsService } from './application/contracts.service';
import { ContractsRepository } from './infrastructure/contracts.repository';
import { ContractsController } from './presentation/contracts.controller';

/**
 * PHASE-08 / 08-C: rental contracts, signatures, receipts and generated
 * PDF downloads. Imports TemplatesModule (renderForTenant bridge) and
 * MediaModule (the ObjectStorage port for private PDF artifacts).
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, SecurityModule, TemplatesModule, MediaModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractsRepository],
  exports: [ContractsService],
})
export class ContractsModule {}
