import {
  BadRequestException,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { IdentityResolutionService } from '../../auth/application/identity-resolution.service';
import { hasAuthPrincipal } from '../../auth/auth-principal';
import { MembershipStore } from '../ports/membership.store';
import { BranchScopeStore } from '../ports/branch-scope.store';

function scopeDenied(): ForbiddenException {
  return new ForbiddenException({
    code: 'FORBIDDEN',
    message: 'You do not have access to this scope.',
  });
}

/**
 * Tenant/branch scope foundations (01-D06/01-D07).
 *
 * A supplied tenantId is never sufficient authorization — the guards below
 * verify the caller's own membership and only then attach server-derived
 * scope to the request. Route parameters are the only request source of
 * agency/branch identifiers; headers, bodies and query strings are ignored.
 */

/** Injects the server-verified agency scope attached by AgencyScopeGuard. */
export const AgencyScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<{ agencyScope?: string }>();
    return request.agencyScope as string;
  },
);

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function routeParam(request: Request, name: string): string | undefined {
  const params = (request as Request & { params?: Record<string, unknown> }).params;
  const value = params?.[name];
  return typeof value === 'string' ? value : undefined;
}

/** Extracts and validates an agency/branch identifier from route params. */
function requireUuidParam(request: Request, name: string, label: string): string {
  const value = routeParam(request, name);
  if (!value || !UUID_SHAPE.test(value)) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `A valid ${label} identifier is required.`,
    });
  }
  return value;
}

/**
 * Agency scope guard (01-D06): the caller must hold an ACTIVE membership in
 * the agency named by the `agencyId` route parameter. On success the request
 * carries the server-verified agency scope (used by repository helpers in
 * 02-D02).
 */
@Injectable()
export class AgencyScopeGuard implements CanActivate {
  constructor(
    private readonly identity: IdentityResolutionService,
    private readonly memberships: MembershipStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!hasAuthPrincipal(request)) {
      return false;
    }
    const userId = await this.identity.resolve(request.authPrincipal as never);
    const agencyId = requireUuidParam(request, 'agencyId', 'agency');

    const membership = await this.memberships.findForUserInAgency(userId, agencyId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw scopeDenied();
    }

    (request as Request & { agencyScope?: string }).agencyScope = agencyId;
    return true;
  }
}

/**
 * Branch scope guard (01-D07): verifies the caller's membership in the
 * agency that owns the branch named by the `branchId` route parameter.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(
    private readonly identity: IdentityResolutionService,
    private readonly branches: BranchScopeStore,
    private readonly memberships: MembershipStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!hasAuthPrincipal(request)) {
      return false;
    }
    const userId = await this.identity.resolve(request.authPrincipal as never);
    const branchId = requireUuidParam(request, 'branchId', 'branch');

    const agencyId = await this.branches.findAgencyIdForBranch(branchId);
    if (!agencyId) {
      throw scopeDenied();
    }
    const membership = await this.memberships.findForUserInAgency(userId, agencyId);
    if (!membership || membership.status !== 'ACTIVE') {
      throw scopeDenied();
    }

    (request as Request & { agencyScope?: string; branchScope?: string }).agencyScope = agencyId;
    (request as Request & { branchScope?: string }).branchScope = branchId;
    return true;
  }
}
