import { Module } from '@nestjs/common';

/**
 * Tenant isolation module (02-D).
 *
 * Provides the data-layer scope helpers (tenantScopedClient,
 * assertTenantScope, assertSameTenant) used by repositories, jobs and
 * exports. Nothing here is stateful — the request tenant context itself is
 * attached per-request by AgencyScopeGuard/BranchScopeGuard (01-D06/07).
 */
@Module({})
export class IsolationModule {}
