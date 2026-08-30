import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuthorizationService } from './application/authorization.service';
import { PermissionGuard } from './guard/permission.guard';
import { StaticBranchScopeStore } from './infrastructure/static-branch-scope-store';
import { StaticMembershipStore } from './infrastructure/static-membership-store';
import { StaticPlatformAdminStore } from './infrastructure/static-platform-admin-store';
import { BranchScopeStore } from './ports/branch-scope.store';
import { MembershipStore } from './ports/membership.store';
import { PlatformAdminStore } from './ports/platform-admin.store';
import { AgencyScopeGuard, BranchScopeGuard } from './scope/tenant-scope';

/**
 * Authorization module (01-D).
 *
 * Server-side RBAC evaluation on top of the verified identity (01-B) and
 * application user state (01-C). Membership/platform-admin/branch stores are
 * static (truthful empty) implementations until their provisioning phases
 * (02-A/02-B/02-C, platform admin phase) supply database-backed ones behind
 * the same ports.
 */
@Module({
  imports: [IdentityModule],
  providers: [
    AuthorizationService,
    PermissionGuard,
    AgencyScopeGuard,
    BranchScopeGuard,
    { provide: MembershipStore, useClass: StaticMembershipStore },
    { provide: PlatformAdminStore, useClass: StaticPlatformAdminStore },
    { provide: BranchScopeStore, useClass: StaticBranchScopeStore },
  ],
  exports: [
    AuthorizationService,
    PermissionGuard,
    AgencyScopeGuard,
    BranchScopeGuard,
    MembershipStore,
    PlatformAdminStore,
    BranchScopeStore,
  ],
})
export class AuthorizationModule {}
