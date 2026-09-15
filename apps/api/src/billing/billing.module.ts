import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { BillingService } from './application/billing.service';
import { LedgerService } from './application/ledger.service';
import { BillingRepository } from './infrastructure/billing.repository';
import { BillingController } from './presentation/billing.controller';

/** PHASE-09 / 09-B financial ledger and settlement invoices. */
@Module({
  imports: [PrismaModule, IdentityModule, AuthorizationModule, SecurityModule],
  controllers: [BillingController],
  providers: [BillingService, LedgerService, BillingRepository],
  exports: [BillingService, LedgerService],
})
export class BillingModule {}
