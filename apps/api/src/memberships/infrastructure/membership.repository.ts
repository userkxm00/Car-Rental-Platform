import { Injectable } from '@nestjs/common';
import { Prisma, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipRecord, MembershipStore } from '../../authorization/ports/membership.store';
import type { RoleValue } from '../../authorization/roles';

export interface MembershipRow {
  id: string;
  tenantId: string;
  userId: string;
  status: MembershipStatus;
  invitedAt: Date;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: string[];
}

/**
 * Membership persistence (02-B01/02-B04) and the database-backed
 * {@link MembershipStore} the authorization layer consumes.
 *
 * The (tenantId, userId) pair is unique by schema; status transitions
 * (02-B03) are validated at the service layer and applied atomically here.
 */
@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, userId: string, roles: RoleValue[]): Promise<MembershipRow> {
    const membership = await this.prisma.membership.create({
      data: {
        tenantId,
        userId,
        status: 'INVITED',
        invitedAt: new Date(),
        roles: { create: roles.map((role) => ({ role })) },
      },
      include: { roles: true },
    });
    return toRow(membership);
  }

  async findByTenantAndUser(tenantId: string, userId: string): Promise<MembershipRow | undefined> {
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      include: { roles: true },
    });
    return membership ? toRow(membership) : undefined;
  }

  async findById(id: string): Promise<MembershipRow | undefined> {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      include: { roles: true },
    });
    return membership ? toRow(membership) : undefined;
  }

  async listForTenant(tenantId: string): Promise<MembershipRow[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: { roles: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map(toRow);
  }

  async listForUser(userId: string): Promise<MembershipRow[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { roles: true },
    });
    return memberships.map(toRow);
  }

  async setStatus(id: string, status: MembershipStatus): Promise<MembershipRow> {
    const membership = await this.prisma.membership.update({
      where: { id },
      data: { status, ...(status === 'ACTIVE' ? { joinedAt: new Date() } : {}) },
      include: { roles: true },
    });
    return toRow(membership);
  }

  async replaceRoles(id: string, roles: RoleValue[]): Promise<MembershipRow> {
    await this.prisma.$transaction([
      this.prisma.membershipRole.deleteMany({ where: { membershipId: id } }),
      this.prisma.membershipRole.createMany({
        data: roles.map((role) => ({ membershipId: id, role })),
      }),
    ]);
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { id },
      include: { roles: true },
    });
    return toRow(membership);
  }
}

function toRow(
  membership: Prisma.MembershipGetPayload<{ include: { roles: true } }>,
): MembershipRow {
  return {
    id: membership.id,
    tenantId: membership.tenantId,
    userId: membership.userId,
    status: membership.status,
    invitedAt: membership.invitedAt,
    joinedAt: membership.joinedAt,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
    roles: membership.roles.map((r) => r.role),
  };
}

/**
 * Database-backed {@link MembershipStore} (replaces the 01-D static store).
 * Registered globally by MembershipsModule (02-B).
 */
@Injectable()
export class DbMembershipStore extends MembershipStore {
  constructor(private readonly repository: MembershipRepository) {
    super();
  }

  override async findForUser(userId: string): Promise<MembershipRecord[]> {
    const rows = await this.repository.listForUser(userId);
    return rows.map(toRecord);
  }

  override async findForUserInAgency(
    userId: string,
    agencyId: string,
  ): Promise<MembershipRecord | undefined> {
    const row = await this.repository.findByTenantAndUser(agencyId, userId);
    return row ? toRecord(row) : undefined;
  }
}

function toRecord(row: MembershipRow): MembershipRecord {
  return {
    userId: row.userId,
    agencyId: row.tenantId,
    roles: row.roles as RoleValue[],
    status: row.status,
  };
}
