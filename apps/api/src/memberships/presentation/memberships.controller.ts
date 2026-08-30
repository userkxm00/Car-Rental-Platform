import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IdentityResolutionService } from '../../auth/application/identity-resolution.service';
import { AuthPrincipal } from '../../auth/auth.guard';
import type { VerifiedPrincipal } from '../../auth/ports/auth-provider.port';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import type { RoleValue } from '../../authorization/roles';
import { MembershipService } from '../application/membership.service';

interface InviteBody {
  userId: string;
  roles: RoleValue[];
}

interface AssignRolesBody {
  roles: RoleValue[];
}

interface StatusBody {
  action: 'suspend' | 'reactivate';
}

function toResponse(row: {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  invitedAt: Date;
  joinedAt: Date | null;
  roles: string[];
}): unknown {
  return {
    id: row.id,
    agencyId: row.tenantId,
    userId: row.userId,
    status: row.status,
    roles: row.roles,
    invitedAt: row.invitedAt.toISOString(),
    joinedAt: row.joinedAt ? row.joinedAt.toISOString() : null,
  };
}

/**
 * Agency membership endpoints (02-B).
 *
 * Agency-side routes are double-protected: AgencyScopeGuard verifies the
 * caller's own ACTIVE membership in the agency (route param), and
 * PermissionGuard requires staff.manage. Invitee-side routes act only on the
 * caller's own invitation (server-resolved identity).
 */
@Controller()
export class MembershipsController {
  constructor(
    private readonly service: MembershipService,
    private readonly identity: IdentityResolutionService,
  ) {}

  @Post('agencies/:agencyId/members')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async invite(@Param('agencyId') agencyId: string, @Body() body: InviteBody): Promise<unknown> {
    const row = await this.service.invite(agencyId, body.userId, body.roles);
    return toResponse(row);
  }

  @Get('agencies/:agencyId/members')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async list(@Param('agencyId') agencyId: string): Promise<unknown> {
    const rows = await this.service.listForTenant(agencyId);
    return { members: rows.map(toResponse) };
  }

  @Patch('agencies/:agencyId/members/:userId/roles')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async assignRoles(
    @Param('agencyId') agencyId: string,
    @Param('userId') userId: string,
    @Body() body: AssignRolesBody,
  ): Promise<unknown> {
    const row = await this.service.assignRoles(agencyId, userId, body.roles);
    return toResponse(row);
  }

  @Patch('agencies/:agencyId/members/:userId/status')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async updateStatus(
    @Param('agencyId') agencyId: string,
    @Param('userId') userId: string,
    @Body() body: StatusBody,
  ): Promise<unknown> {
    const row =
      body.action === 'suspend'
        ? await this.service.suspend(agencyId, userId)
        : await this.service.reactivate(agencyId, userId);
    return toResponse(row);
  }

  @Delete('agencies/:agencyId/members/:userId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async remove(
    @Param('agencyId') agencyId: string,
    @Param('userId') userId: string,
  ): Promise<unknown> {
    await this.service.remove(agencyId, userId);
    return { removed: true };
  }

  @Post('memberships/:membershipId/accept')
  async accept(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('membershipId') membershipId: string,
  ): Promise<unknown> {
    const userId = await this.identity.resolve(principal);
    const row = await this.service.accept(userId, membershipId);
    return toResponse(row);
  }

  @Post('memberships/:membershipId/decline')
  async decline(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('membershipId') membershipId: string,
  ): Promise<unknown> {
    const userId = await this.identity.resolve(principal);
    const row = await this.service.decline(userId, membershipId);
    return toResponse(row);
  }

  /** The caller's own memberships — the agency context picker for clients. */
  @Get('me/memberships')
  async myMemberships(@AuthPrincipal() principal: VerifiedPrincipal): Promise<unknown> {
    const userId = await this.identity.resolve(principal);
    const rows = await this.service.listForUser(userId);
    return { memberships: rows.map(toResponse) };
  }
}
