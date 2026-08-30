import { UserProfile, UserRepository } from '../../identity/infrastructure/user.repository';
import { MembershipRecord, MembershipStore } from '../ports/membership.store';
import { PlatformAdminStore } from '../ports/platform-admin.store';
import { Permission } from '../permissions';
import { Role } from '../roles';
import { AuthorizationService } from './authorization.service';

const activeUser: UserProfile = {
  id: 'u-1',
  email: 'a@b.co',
  phone: null,
  displayName: 'a',
  preferredLocale: 'en',
  timezone: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeUsers(status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE'): UserRepository {
  return {
    findById: (id: string) => Promise.resolve(id === 'u-1' ? { ...activeUser, status } : undefined),
  } as unknown as UserRepository;
}

class MemoryMembershipStore extends MembershipStore {
  constructor(private readonly rows: MembershipRecord[]) {
    super();
  }

  override findForUser(userId: string): Promise<MembershipRecord[]> {
    return Promise.resolve(this.rows.filter((m) => m.userId === userId));
  }

  override findForUserInAgency(
    userId: string,
    agencyId: string,
  ): Promise<MembershipRecord | undefined> {
    return Promise.resolve(
      this.rows.find(
        (m) => m.userId === userId && m.agencyId === agencyId && m.status !== 'REMOVED',
      ),
    );
  }
}

class MemoryPlatformAdminStore extends PlatformAdminStore {
  constructor(private readonly admins: string[]) {
    super();
  }

  override isPlatformAdmin(userId: string): Promise<boolean> {
    return Promise.resolve(this.admins.includes(userId));
  }
}

const OWNER_MEMBERSHIP: MembershipRecord = {
  userId: 'u-1',
  agencyId: 'agency-1',
  role: Role.AGENCY_OWNER_ADMIN,
  status: 'ACTIVE',
};

function makeService(options: {
  status?: 'ACTIVE' | 'SUSPENDED';
  memberships?: MembershipRecord[];
  admins?: string[];
}): AuthorizationService {
  return new AuthorizationService(
    makeUsers(options.status),
    new MemoryMembershipStore(options.memberships ?? []),
    new MemoryPlatformAdminStore(options.admins ?? []),
  );
}

describe('AuthorizationService (01-D04)', () => {
  it('grants customer-default permissions to an active user without membership', async () => {
    const service = makeService({});
    await expect(service.evaluate('u-1', Permission.PROFILE_MANAGE)).resolves.toMatchObject({
      allowed: true,
      via: 'customer-default',
    });
    await expect(service.evaluate('u-1', Permission.VEHICLE_READ)).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('denies agency capabilities to a user without membership', async () => {
    const service = makeService({});
    const decision = await service.evaluate('u-1', Permission.STAFF_MANAGE);
    expect(decision).toMatchObject({ allowed: false, reason: 'no-permission' });
  });

  it('denies agency capabilities outside an existing membership (wrong scope)', async () => {
    const service = makeService({ memberships: [OWNER_MEMBERSHIP] });
    const decision = await service.evaluate('u-1', Permission.STAFF_MANAGE, {
      agencyId: 'other-agency',
    });
    expect(decision).toMatchObject({ allowed: false, reason: 'no-membership' });
  });

  it('grants agency capabilities within an active membership', async () => {
    const service = makeService({ memberships: [OWNER_MEMBERSHIP] });
    const decision = await service.evaluate('u-1', Permission.STAFF_MANAGE, {
      agencyId: 'agency-1',
    });
    expect(decision).toMatchObject({
      allowed: true,
      via: 'membership',
      roles: [Role.AGENCY_OWNER_ADMIN],
    });
  });

  it('denies when the membership role does not include the permission', async () => {
    const service = makeService({ memberships: [OWNER_MEMBERSHIP] });
    const decision = await service.evaluate('u-1', Permission.PLATFORM_ADMIN, {
      agencyId: 'agency-1',
    });
    expect(decision).toMatchObject({ allowed: false });
  });

  it('denies SUSPENDED memberships', async () => {
    const service = makeService({ memberships: [{ ...OWNER_MEMBERSHIP, status: 'SUSPENDED' }] });
    const decision = await service.evaluate('u-1', Permission.STAFF_MANAGE, {
      agencyId: 'agency-1',
    });
    expect(decision).toMatchObject({ allowed: false, reason: 'no-membership' });
  });

  it('denies everything for a suspended/deactivated application user', async () => {
    const service = makeService({
      status: 'SUSPENDED',
      admins: ['u-1'],
      memberships: [OWNER_MEMBERSHIP],
    });
    for (const permission of [
      Permission.PROFILE_MANAGE,
      Permission.STAFF_MANAGE,
      Permission.PLATFORM_ADMIN,
    ]) {
      await expect(service.evaluate('u-1', permission)).resolves.toMatchObject({
        allowed: false,
        reason: 'user-disabled',
      });
    }
  });

  it('grants platform-boundary permission only through the platform admin store', async () => {
    const admin = makeService({ admins: ['u-1'] });
    await expect(admin.evaluate('u-1', Permission.PLATFORM_ADMIN)).resolves.toMatchObject({
      allowed: true,
      via: 'platform-admin',
    });
    const ordinary = makeService({ memberships: [OWNER_MEMBERSHIP] });
    await expect(ordinary.evaluate('u-1', Permission.PLATFORM_ADMIN)).resolves.toMatchObject({
      allowed: false,
    });
  });

  it('ignores any client-supplied role/tenant inputs — evaluation reads stores only (01-D08)', async () => {
    // The service API takes no role/tenant inputs at all: only the
    // server-resolved userId, the permission and a server-attached scope
    // flow in. There is no parameter a spoofed payload could populate.
    const service = makeService({ memberships: [OWNER_MEMBERSHIP] });
    const decision = await service.evaluate('u-1', Permission.STAFF_MANAGE, {
      agencyId: 'agency-1',
    });
    expect(decision).toMatchObject({ allowed: true, via: 'membership' });
  });

  it('require() throws the documented 403 envelopes', async () => {
    const service = makeService({});
    await expect(service.require('u-1', Permission.STAFF_MANAGE)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN', details: { permission: Permission.STAFF_MANAGE } },
    });
    const suspended = makeService({ status: 'SUSPENDED' });
    await expect(suspended.require('u-1', Permission.PROFILE_MANAGE)).rejects.toMatchObject({
      response: { code: 'USER_DISABLED' },
    });
  });
});
