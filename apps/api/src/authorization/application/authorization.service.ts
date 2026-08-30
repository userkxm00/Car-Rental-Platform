import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { UserRepository } from '../../identity/infrastructure/user.repository';
import { MembershipStore } from '../ports/membership.store';
import { PlatformAdminStore } from '../ports/platform-admin.store';
import { PermissionValue, PERMISSION_DOC, Permission } from '../permissions';
import { permissionsForRole, RoleValue } from '../roles';

export type AuthorizationDecision =
  | { allowed: true; via: 'platform-admin' | 'membership' | 'customer-default'; roles: RoleValue[] }
  | { allowed: false; reason: 'user-disabled' | 'no-permission' | 'no-membership' };

export interface AuthorizationContext {
  /**
   * Agency scope attached by a server-side scope guard (01-D06/01-D07).
   * Client-supplied tenant identifiers are never accepted as scope input.
   */
  agencyId?: string;
}

/**
 * Permission evaluation service (01-D04).
 *
 * Evaluation order (architecture/authentication-authorization.md):
 * active application user → platform grant → tenant membership role →
 * permission bundle → (branch/resource scope enforced by guards). A client
 * can never supply a role, tenant or permission input to this service —
 * only server-side stores are consulted (01-D08).
 */
@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger('Authorization');

  constructor(
    private readonly users: UserRepository,
    private readonly memberships: MembershipStore,
    private readonly platformAdmins: PlatformAdminStore,
  ) {}

  async evaluate(
    userId: string,
    permission: PermissionValue,
    scope?: AuthorizationContext,
  ): Promise<AuthorizationDecision> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      return { allowed: false, reason: 'user-disabled' };
    }

    // Platform boundary: explicit grant only, audited.
    if (
      permission === (Permission.PLATFORM_ADMIN as PermissionValue) ||
      permission.startsWith('platform.')
    ) {
      const isAdmin = await this.platformAdmins.isPlatformAdmin(userId);
      if (isAdmin) {
        this.audit(userId, permission, scope, true, 'platform-admin');
        return { allowed: true, via: 'platform-admin', roles: [] };
      }
      this.audit(userId, permission, scope, false, 'no-permission');
      return { allowed: false, reason: 'no-permission' };
    }

    const agencyId = scope?.agencyId;
    const membership = agencyId
      ? await this.memberships.findForUserInAgency(userId, agencyId)
      : undefined;

    if (agencyId && !membership) {
      this.audit(userId, permission, scope, false, 'no-membership');
      return { allowed: false, reason: 'no-membership' };
    }

    if (membership) {
      if (membership.status !== 'ACTIVE') {
        this.audit(userId, permission, scope, false, 'no-membership');
        return { allowed: false, reason: 'no-membership' };
      }
      const granted = permissionsForRole(membership.role).includes(permission);
      this.audit(userId, permission, scope, granted, granted ? 'membership' : 'no-permission');
      return granted
        ? { allowed: true, via: 'membership', roles: [membership.role] }
        : { allowed: false, reason: 'no-permission' };
    }

    // No agency scope: the user acts as a customer (default role).
    const granted = permissionsForRole('CUSTOMER').includes(permission);
    this.audit(userId, permission, scope, granted, granted ? 'customer-default' : 'no-permission');
    return granted
      ? { allowed: true, via: 'customer-default', roles: ['CUSTOMER'] }
      : { allowed: false, reason: 'no-permission' };
  }

  /** Require a permission; throws the documented 403 envelope when denied. */
  async require(
    userId: string,
    permission: PermissionValue,
    scope?: AuthorizationContext,
  ): Promise<void> {
    const decision = await this.evaluate(userId, permission, scope);
    if (!decision.allowed) {
      const message =
        decision.reason === 'user-disabled'
          ? 'This account is suspended or deactivated.'
          : 'You do not have permission for this action.';
      throw new ForbiddenException({
        code: decision.reason === 'user-disabled' ? 'USER_DISABLED' : 'FORBIDDEN',
        message,
        details: { permission, agencyId: scope?.agencyId },
      });
    }
  }

  private audit(
    userId: string,
    permission: PermissionValue,
    scope: AuthorizationContext | undefined,
    allowed: boolean,
    via: string,
  ): void {
    // Privileged/denied decisions are operational evidence (01-D09). The
    // request correlation ID is attached automatically by the logger.
    if (permission.startsWith('platform.') || !allowed) {
      this.logger.warn({
        event: 'authorization.decision',
        userId,
        permission,
        description: PERMISSION_DOC[permission],
        agencyId: scope?.agencyId ?? null,
        allowed,
        via,
      });
    }
  }
}
