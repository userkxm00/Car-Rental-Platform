import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { SecurityModule } from '../security/security.module';
import { DocumentsService } from './application/documents.service';
import { DocumentsRepository } from './infrastructure/documents.repository';
import { DocumentsController } from './presentation/documents.controller';

/**
 * PHASE-08 / 08-A: agency document policies, the required-document rules
 * and the booking document checklist with expiry evaluation.
 *
 * Deliberately imports nothing from the bookings module: the checklist
 * reads booking context rows directly and the bookings module consumes
 * {@link DocumentsService} for the READY_FOR_PICKUP gate — one direction
 * only, no cycles.
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, SecurityModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository],
  exports: [DocumentsService],
})
export class DocumentsModule {}
