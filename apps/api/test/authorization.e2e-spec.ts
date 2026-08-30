import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { AppModule } from '../src/app.module';
import { AuthorizationModule } from '../src/authorization/authorization.module';
import { IdentityModule } from '../src/identity/identity.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import {
  PermissionGuard,
  PlatformScope,
  RequirePermission,
} from '../src/authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../src/authorization/scope/tenant-scope';
import { MembershipRecord, MembershipStore } from '../src/authorization/ports/membership.store';
import { PlatformAdminStore } from '../src/authorization/ports/platform-admin.store';
import { Permission } from '../src/authorization/permissions';
import { Role } from '../src/authorization/roles';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * Authorization integration tests (01-D10).
 *
 * Test-only controllers mirror what domain modules will declare: permission
 * requirements and platform/agency scope guards. The suite proves that
 * decisions come exclusively from server-side stores — spoofed headers,
 * query params and bodies never change an outcome (01-D08).
 */

@Controller('authz-demo')
class AuthzDemoController {
  @Get('self')
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PROFILE_MANAGE)
  self(): { ok: true } {
    return { ok: true };
  }

  @Get('agency-manage')
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  agencyManage(): { ok: true } {
    return { ok: true };
  }

  @Get('agencies/:agencyId/manage')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  agencyScopedManage(): { ok: true } {
    return { ok: true };
  }

  @Get('platform')
  @UseGuards(PermissionGuard)
  @PlatformScope()
  platform(): { ok: true } {
    return { ok: true };
  }

  @Get('agencies/:agencyId/data')
  @UseGuards(AgencyScopeGuard)
  agencyData(): { ok: true } {
    return { ok: true };
  }
}

const JWKS_PORT = 4128;
const AGENCY_ID = '11111111-1111-4111-8111-111111111111';

describe('Authorization (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let membershipStore: MembershipStore;
  let platformAdminStore: PlatformAdminStore;

  const memberships = new Map<string, MembershipRecord[]>();

  class TestMembershipStore extends MembershipStore {
    override findForUser(userId: string): Promise<MembershipRecord[]> {
      return Promise.resolve(memberships.get(userId) ?? []);
    }

    override findForUserInAgency(
      userId: string,
      agencyId: string,
    ): Promise<MembershipRecord | undefined> {
      return Promise.resolve(
        (memberships.get(userId) ?? []).find(
          (m) => m.agencyId === agencyId && m.status !== 'REMOVED',
        ),
      );
    }
  }

  class TestPlatformAdminStore extends PlatformAdminStore {
    override isPlatformAdmin(userId: string): Promise<boolean> {
      return Promise.resolve(userId === platformAdminUser);
    }
  }

  let platformAdminUser: string | null = null;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const testEnv = loadEnvSchema({
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental',
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    membershipStore = new TestMembershipStore();
    platformAdminStore = new TestPlatformAdminStore();

    const moduleRef = await Test.createTestingModule({
      // Domain modules importing AuthorizationModule see its guard exports;
      // the test-level controller lives in RootTestModule, so import the
      // modules it depends on directly (same composition real modules use).
      imports: [AppModule, IdentityModule, AuthorizationModule],
      controllers: [AuthzDemoController],
    })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .overrideProvider(MembershipStore)
      .useValue(membershipStore)
      .overrideProvider(PlatformAdminStore)
      .useValue(platformAdminStore)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  async function token(subject: string): Promise<string> {
    return jwks.signToken({ sub: subject, email: `${subject}@kavriqo.test`, email_verified: true });
  }

  it('requires authentication on all authorization-demo routes', async () => {
    for (const path of [
      '/api/v1/authz-demo/self',
      '/api/v1/authz-demo/agency-manage',
      '/api/v1/authz-demo/platform',
    ]) {
      const res = await api(app).get(path).expect(401);
      expect((res.body as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
    }
  });

  it('grants a customer the self-service permission', async () => {
    const res = await api(app)
      .get('/api/v1/authz-demo/self')
      .set('Authorization', `Bearer ${await token('authz-user-1')}`)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('denies a customer agency capabilities', async () => {
    const res = await api(app)
      .get('/api/v1/authz-demo/agency-manage')
      .set('Authorization', `Bearer ${await token('authz-user-1')}`)
      .expect(403);
    expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });

  it('denies platform-boundary routes to non-admins even with spoofed headers/query (01-D08)', async () => {
    const res = await api(app)
      .get('/api/v1/authz-demo/platform?role=PLATFORM_ADMIN')
      .set('Authorization', `Bearer ${await token('authz-user-1')}`)
      .set('X-Role', 'PLATFORM_ADMIN')
      .set('X-Tenant-Id', 'anything')
      .expect(403);
    expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });

  it('grants platform routes only to a server-granted platform admin', async () => {
    platformAdminUser = 'admin-app-user';
    const provision = await api(app)
      .get('/api/v1/authz-demo/self')
      .set('Authorization', `Bearer ${await token('authz-user-1')}`)
      .expect(200);
    void provision;
    const profile = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${await token('authz-user-1')}`)
      .expect(200);
    const adminAppUserId = (profile.body as { id: string }).id;
    platformAdminUser = adminAppUserId;

    const res = await api(app)
      .get('/api/v1/authz-demo/platform')
      .set('Authorization', `Bearer ${await token('authz-user-1')}`)
      .expect(200);
    expect(res.body).toEqual({ ok: true });

    platformAdminUser = null;
  });

  it('denies agency capabilities without a verified agency scope', async () => {
    const userId = await resolveAppUserId('authz-user-2');
    memberships.set(userId, [
      { userId, agencyId: AGENCY_ID, role: Role.AGENCY_OWNER_ADMIN, status: 'ACTIVE' },
    ]);
    // Membership exists, but no server-attached scope → the scoped
    // permission cannot be granted from a bare request (01-D06).
    await api(app)
      .get('/api/v1/authz-demo/agency-manage')
      .set('Authorization', `Bearer ${await token('authz-user-2')}`)
      .expect(403);
  });

  it('grants agency-scoped capability through an active membership + scope guard', async () => {
    const userId = await resolveAppUserId('authz-user-2');
    memberships.set(userId, [
      { userId, agencyId: AGENCY_ID, role: Role.AGENCY_OWNER_ADMIN, status: 'ACTIVE' },
    ]);
    const ok = await api(app)
      .get(`/api/v1/authz-demo/agencies/${AGENCY_ID}/manage`)
      .set('Authorization', `Bearer ${await token('authz-user-2')}`)
      .expect(200);
    expect(ok.body).toEqual({ ok: true });
  });

  it('denies agency-scope routes to members of other agencies and to non-members', async () => {
    // Other agency membership.
    const memberId = await resolveAppUserId('authz-user-3');
    memberships.set(memberId, [
      {
        userId: memberId,
        agencyId: '22222222-2222-4222-8222-222222222222',
        role: Role.AGENCY_OWNER_ADMIN,
        status: 'ACTIVE',
      },
    ]);
    await api(app)
      .get(`/api/v1/authz-demo/agencies/${AGENCY_ID}/data`)
      .set('Authorization', `Bearer ${await token('authz-user-3')}`)
      .expect(403);

    // No membership at all.
    await api(app)
      .get(`/api/v1/authz-demo/agencies/${AGENCY_ID}/data`)
      .set('Authorization', `Bearer ${await token('authz-user-4')}`)
      .expect(403);
  });

  it('grants agency-scope routes for the right member regardless of spoofed tenant headers', async () => {
    const userId = await resolveAppUserId('authz-user-2');
    memberships.set(userId, [
      { userId, agencyId: AGENCY_ID, role: Role.AGENCY_OWNER_ADMIN, status: 'ACTIVE' },
    ]);
    const res = await api(app)
      .get(`/api/v1/authz-demo/agencies/${AGENCY_ID}/data`)
      .set('Authorization', `Bearer ${await token('authz-user-2')}`)
      .set('X-Tenant-Id', AGENCY_ID)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects malformed scope identifiers with 400', async () => {
    await api(app)
      .get('/api/v1/authz-demo/agencies/not-a-uuid/data')
      .set('Authorization', `Bearer ${await token('authz-user-2')}`)
      .expect(400);
  });

  async function resolveAppUserId(subject: string): Promise<string> {
    const res = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${await token(subject)}`)
      .expect(200);
    return (res.body as { id: string }).id;
  }
});
