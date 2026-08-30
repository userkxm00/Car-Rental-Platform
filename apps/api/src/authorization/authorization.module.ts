import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuthorizationService } from './application/authorization.service';
import { PermissionGuard } from './guard/permission.guard';
import { StaticBranchScopeStore } from './infrastructure/static-branch-scope-store';
import { StaticPlatformAdminStore } from './infrastructure/static-platform-admin-store';
import { BranchScopeStore } from './ports/branch-scope.store';
import { PlatformAdminStore } from './ports/platform-admin.store';
import { AgencyScopeGuard, BranchScopeGuard } from './scope/tenant-scope';

/**
 * Authorization module (01-D).
 *
 * Server-side RBAC evaluation on top of the verified identity (01-B) and
 * application user state (01-C). The platform-admin and branch-scope stores
 * are static (truthful empty) implementations until their provisioning
 * phases (02-C, platform admin phase) supply database-backed ones behind the
 * same ports. The membership store token is provided by MembershipsModule
 * (02-B, global).
 */
@Module({
  imports: [IdentityModule],
  providers: [
    AuthorizationService,
    PermissionGuard,
    AgencyScopeGuard,
    BranchScopeGuard,
    { provide: PlatformAdminStore, useClass: StaticPlatformAdminStore },
    { provide: BranchScopeStore, useClass: StaticBranchScopeStore },
  ],
  exports: [
    AuthorizationService,
    PermissionGuard,
    AgencyScopeGuard,
    BranchScopeGuard,
    PlatformAdminStore,
    BranchScopeStore,
  ],
})
export class AuthorizationModule {}
