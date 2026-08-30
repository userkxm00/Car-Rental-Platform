import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MEMBERSHIP_ROLES, RoleValue } from '../../authorization/roles';
import { TenantService } from '../../tenants/application/tenant.service';
import {
  canTransitionMembership,
  MembershipErrorCode,
  MembershipStatusValue,
} from '../domain/membership-rules';
import { MembershipRepository, MembershipRow } from '../infrastructure/membership.repository';

/**
 * Membership use-cases (02-B01…B05): invite, accept/decline, suspend/
 * reactivate, role assignment, removal.
 *
 * Ownership rules are enforced here from server-resolved identity:
 * - invitations target an existing application user;
 * - only the invited user accepts/declines their own invitation;
 * - agency-side operations require the tenant to be ACTIVE and are guarded
 *   by AgencyScopeGuard + staff.manage at the HTTP layer.
 */
@Injectable()
export class MembershipService {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly tenants: TenantService,
  ) {}

  /** Invite a user into an agency with one or more membership roles (02-B01). */
  async invite(
    agencyId: string,
    inviteeUserId: string,
    roles: RoleValue[],
  ): Promise<MembershipRow> {
    const tenant = await this.tenants.getById(agencyId);
    if (tenant.status !== 'ACTIVE') {
      throw new ConflictException({
        code: MembershipErrorCode.TENANT_NOT_ACTIVE,
        message: 'Invitations are only possible for active agencies.',
      });
    }
    this.assertValidRoles(roles);

    const existing = await this.memberships.findByTenantAndUser(agencyId, inviteeUserId);
    if (existing) {
      if (existing.status === 'DECLINED') {
        // Re-invite a declined membership: back to INVITED with new roles.
        await this.memberships.replaceRoles(existing.id, roles);
        return this.transition(existing, 'INVITED');
      }
      throw new ConflictException({
        code: MembershipErrorCode.MEMBERSHIP_EXISTS,
        message: 'This user already has a membership with the agency.',
      });
    }
    return this.memberships.create(agencyId, inviteeUserId, roles);
  }

  /** Accept an invitation (02-B02). Only the invited user may accept. */
  async accept(userId: string, membershipId: string): Promise<MembershipRow> {
    const membership = await this.requireMembership(membershipId);
    this.assertOwnMembership(membership, userId);
    if (membership.status === 'ACTIVE') {
      return membership;
    }
    return this.transition(membership, 'ACTIVE');
  }

  /** Decline an invitation (02-B02). Only the invited user may decline. */
  async decline(userId: string, membershipId: string): Promise<MembershipRow> {
    const membership = await this.requireMembership(membershipId);
    this.assertOwnMembership(membership, userId);
    if (membership.status === 'DECLINED') {
      return membership;
    }
    return this.transition(membership, 'DECLINED');
  }

  /** Suspend/reactivate/remove a membership (02-B03/02-B05). */
  async transition(membership: MembershipRow, to: MembershipStatusValue): Promise<MembershipRow> {
    if (!canTransitionMembership(membership.status, to)) {
      throw new ConflictException({
        code: MembershipErrorCode.INVALID_MEMBERSHIP_TRANSITION,
        message: `Membership cannot change from ${membership.status} to ${to}.`,
      });
    }
    return this.memberships.setStatus(membership.id, to);
  }

  async suspend(agencyId: string, targetUserId: string): Promise<MembershipRow> {
    const membership = await this.requireTenantMembership(agencyId, targetUserId);
    return this.transition(membership, 'SUSPENDED');
  }

  async reactivate(agencyId: string, targetUserId: string): Promise<MembershipRow> {
    const membership = await this.requireTenantMembership(agencyId, targetUserId);
    return this.transition(membership, 'ACTIVE');
  }

  async remove(agencyId: string, targetUserId: string): Promise<void> {
    const membership = await this.requireTenantMembership(agencyId, targetUserId);
    await this.transition(membership, 'REMOVED');
  }

  /** Assign roles to a membership (02-B04). */
  async assignRoles(
    agencyId: string,
    targetUserId: string,
    roles: RoleValue[],
  ): Promise<MembershipRow> {
    this.assertValidRoles(roles);
    const membership = await this.requireTenantMembership(agencyId, targetUserId);
    if (membership.status !== 'ACTIVE' && membership.status !== 'INVITED') {
      throw new ConflictException({
        code: MembershipErrorCode.INVALID_MEMBERSHIP_TRANSITION,
        message: 'Roles can only be assigned to invited or active memberships.',
      });
    }
    return this.memberships.replaceRoles(membership.id, roles);
  }

  async listForTenant(agencyId: string): Promise<MembershipRow[]> {
    return this.memberships.listForTenant(agencyId);
  }

  /** All memberships of a user across agencies (02-B06). */
  async listForUser(userId: string): Promise<MembershipRow[]> {
    return this.memberships.listForUser(userId);
  }

  async getById(membershipId: string): Promise<MembershipRow> {
    return this.requireMembership(membershipId);
  }

  private async requireMembership(membershipId: string): Promise<MembershipRow> {
    const membership = await this.memberships.findById(membershipId);
    if (!membership) {
      throw new NotFoundException({
        code: MembershipErrorCode.MEMBERSHIP_NOT_FOUND,
        message: 'Membership not found.',
      });
    }
    return membership;
  }

  private async requireTenantMembership(agencyId: string, userId: string): Promise<MembershipRow> {
    const membership = await this.memberships.findByTenantAndUser(agencyId, userId);
    if (!membership) {
      throw new NotFoundException({
        code: MembershipErrorCode.MEMBERSHIP_NOT_FOUND,
        message: 'Membership not found.',
      });
    }
    return membership;
  }

  private assertOwnMembership(membership: MembershipRow, userId: string): void {
    if (membership.userId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only act on your own invitation.',
      });
    }
  }

  private assertValidRoles(roles: RoleValue[]): void {
    if (roles.length === 0) {
      throw new ConflictException({
        code: MembershipErrorCode.MEMBERSHIP_VALIDATION_FAILED,
        message: 'At least one role is required.',
      });
    }
    const invalid = roles.filter((role) => !(MEMBERSHIP_ROLES as readonly string[]).includes(role));
    if (invalid.length > 0) {
      throw new ConflictException({
        code: MembershipErrorCode.INVALID_ROLE,
        message: `Role(s) cannot be assigned through membership: ${invalid.join(', ')}.`,
      });
    }
    if (new Set(roles).size !== roles.length) {
      throw new ConflictException({
        code: MembershipErrorCode.MEMBERSHIP_VALIDATION_FAILED,
        message: 'Duplicate roles are not allowed.',
      });
    }
  }
}
