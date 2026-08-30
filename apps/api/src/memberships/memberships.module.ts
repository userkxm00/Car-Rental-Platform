import { Global, Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MembershipService } from './application/membership.service';
import { DbMembershipStore, MembershipRepository } from './infrastructure/membership.repository';
import { MembershipStore } from '../authorization/ports/membership.store';
import { MembershipsController } from './presentation/memberships.controller';

/**
 * Membership module (02-B).
 *
 * @Global so the database-backed {@link MembershipStore} is available to the
 * authorization layer without creating a module cycle (authorization
 * consumes the token; this module consumes the guards).
 */
@Global()
@Module({
  imports: [TenantsModule, IdentityModule, AuthorizationModule],
  controllers: [MembershipsController],
  providers: [
    MembershipRepository,
    DbMembershipStore,
    { provide: MembershipStore, useExisting: DbMembershipStore },
    MembershipService,
  ],
  exports: [MembershipRepository, MembershipService, MembershipStore],
})
export class MembershipsModule {}
