import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FleetModule } from '../fleet/fleet.module';
import { IdentityModule } from '../identity/identity.module';
import { SecurityModule } from '../security/security.module';
import { CustomerSelfService } from './application/customer-self.service';
import { CustomersService } from './application/customers.service';
import { CustomerSelfRepository } from './infrastructure/customer-self.repository';
import { CustomersRepository } from './infrastructure/customers.repository';
import { CustomerMeController } from './presentation/customer-me.controller';
import { CustomersController } from './presentation/customers.controller';

/**
 * PHASE-07 / 07-A customer identity & profile.
 *
 * Agency-side tenant-scoped customer master (07-A01) with platform-account
 * linkage (07-A02), self-service profile settings (07-A03), document
 * requirements state (07-A04) and the user-scoped marketplace signals:
 * favorites (07-A05), recently viewed (07-A06), search history (07-A07).
 */
@Module({
  imports: [IdentityModule, FleetModule, AuthorizationModule, SecurityModule],
  controllers: [CustomersController, CustomerMeController],
  providers: [CustomersService, CustomerSelfService, CustomersRepository, CustomerSelfRepository],
  exports: [CustomersService],
})
export class CustomersModule {}
