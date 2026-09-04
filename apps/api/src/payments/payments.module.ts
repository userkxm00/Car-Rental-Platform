import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { SecurityModule } from '../security/security.module';
import { PaymentsService } from './application/payments.service';
import { PaymentsRepository } from './infrastructure/payments.repository';
import { PaymentsController } from './presentation/payments.controller';

/**
 * PHASE-09 / 09-A: rental payments — the booking payment intent, manual
 * payment records with the confirmation workflow, and the deposit hold
 * lifecycle. All money is integer minor units derived from the immutable
 * booking price snapshot; nothing in this module deletes money.
 */
@Module({
  imports: [IdentityModule, AuthorizationModule, SecurityModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
