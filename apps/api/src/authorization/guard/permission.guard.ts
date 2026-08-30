import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityResolutionService } from '../../auth/application/identity-resolution.service';
import { AuthRequest, hasAuthPrincipal } from '../../auth/auth-principal';
import { AuthorizationService } from '../application/authorization.service';
import { PermissionValue, Permission } from '../permissions';

export interface AuthorizedRequest extends AuthRequest {
  authUserId?: string;
  /** Server-attached by AgencyScopeGuard/BranchScopeGuard (01-D06/01-D07). */
  agencyScope?: string;
  branchScope?: string;
}

export const PERMISSION_KEY = 'authz:permission';
export const PLATFORM_SCOPE_KEY = 'authz:platform-scope';

/** Requires the given permission for the route (server-evaluated). */
export const RequirePermission = (
  ...permissions: PermissionValue[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSION_KEY, permissions);

/** Marks a route as platform-boundary: requires the platform.admin grant. */
export const PlatformScope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PLATFORM_SCOPE_KEY, true);

/** Injects the resolved application user ID of the verified caller. */
export const AuthUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    return request.authUserId as string;
  },
);

/**
 * Permission guard (01-D04/01-D05).
 *
 * Resolves the verified principal to the application user, evaluates the
 * required permission server-side (roles/grants/memberships only — never
 * client inputs), and attaches the resolved user ID to the request.
 * Platform-boundary routes additionally require the audited platform grant.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityResolutionService,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionValue[] | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const platformScope = this.reflector.getAllAndOverride<boolean>(PLATFORM_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required && !platformScope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    if (!hasAuthPrincipal(request)) {
      // AuthGuard runs first globally; defensive fail-closed.
      return false;
    }

    const userId = await this.identity.resolve(request.authPrincipal as never);
    request.authUserId = userId;

    if (platformScope) {
      await this.authorization.require(userId, Permission.PLATFORM_ADMIN);
      return true;
    }

    // Scope input comes only from the server-attached agency scope — never
    // from headers/query/body (01-D08).
    const scope = request.agencyScope ? { agencyId: request.agencyScope } : undefined;
    for (const permission of required ?? []) {
      await this.authorization.require(userId, permission, scope);
    }
    return true;
  }
}
