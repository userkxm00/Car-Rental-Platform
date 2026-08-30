import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { MembershipService } from '../src/memberships/application/membership.service';
import { TenantService } from '../src/tenants/application/tenant.service';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * Membership integration tests (02-B06): multi-agency membership, invite/
 * accept/decline flows, role assignment, lifecycle, cross-agency denial —
 * over real HTTP with real PostgreSQL.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4131;

interface MembershipBody {
  id: string;
  agencyId: string;
  userId: string;
  status: string;
  roles: string[];
  joinedAt?: string;
}

function asMembership(body: unknown): MembershipBody {
  return body as MembershipBody;
}

describe('Memberships (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;

  let ownerAgencyId: string;
  let otherAgencyId: string;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const testEnv = loadEnvSchema({
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();

    tenants = app.get(TenantService);
    memberships = app.get(MembershipService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    // Suite-owned agencies.
    const ownerAgency = await tenants.create({ name: 'MB Owner Agency', slug: 'mbt-owner' });
    const otherAgency = await tenants.create({ name: 'MB Other Agency', slug: 'mbt-other' });
    ownerAgencyId = ownerAgency.id;
    otherAgencyId = otherAgency.id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'mbt-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function token(subject: string): Promise<string> {
    return jwks.signToken({
      sub: subject,
      email: `${subject}@kavriqo.test`,
      email_verified: true,
    });
  }

  async function appUserId(subject: string): Promise<string> {
    const res = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${await token(subject)}`)
      .expect(200);
    return (res.body as { id: string }).id;
  }

  async function ownerToken(): Promise<string> {
    // Owner is a member of ownerAgency with AGENCY_OWNER_ADMIN. Idempotent:
    // repeated calls reuse the existing active membership.
    const ownerSubject = 'mbt-owner-user';
    const userId = await appUserId(ownerSubject);
    let membership = (await memberships.listForTenant(ownerAgencyId)).find(
      (m) => m.userId === userId,
    );
    if (!membership) {
      await memberships.invite(ownerAgencyId, userId, ['AGENCY_OWNER_ADMIN']);
      membership = (await memberships.listForTenant(ownerAgencyId)).find(
        (m) => m.userId === userId,
      );
      if (!membership) throw new Error('owner membership missing');
    }
    if (membership.status !== 'ACTIVE') {
      await memberships.accept(userId, membership.id);
    }
    return token(ownerSubject);
  }

  it('invites a user, who then accepts (02-B01/02-B02)', async () => {
    const ownerAuth = await ownerToken();
    const inviteeId = await appUserId('mbt-invitee-1');

    const inviteRes = await api(app)
      .post(`/api/v1/agencies/${ownerAgencyId}/members`)
      .set('Authorization', `Bearer ${ownerAuth}`)
      .send({ userId: inviteeId, roles: ['STAFF_AGENT'] })
      .expect(201);
    const invited = asMembership(inviteRes.body);
    expect(invited).toMatchObject({ status: 'INVITED', roles: ['STAFF_AGENT'] });

    const acceptRes = await api(app)
      .post(`/api/v1/memberships/${invited.id}/accept`)
      .set('Authorization', `Bearer ${await token('mbt-invitee-1')}`)
      .expect(201);
    const accepted = asMembership(acceptRes.body);
    expect(accepted.status).toBe('ACTIVE');
    expect(typeof accepted.joinedAt).toBe('string');
  });

  it('allows a declined invitation to be re-invited', async () => {
    const ownerAuth = await ownerToken();
    const inviteeId = await appUserId('mbt-invitee-2');

    const invited = asMembership(
      (
        await api(app)
          .post(`/api/v1/agencies/${ownerAgencyId}/members`)
          .set('Authorization', `Bearer ${ownerAuth}`)
          .send({ userId: inviteeId, roles: ['STAFF_AGENT'] })
          .expect(201)
      ).body,
    );
    await api(app)
      .post(`/api/v1/memberships/${invited.id}/decline`)
      .set('Authorization', `Bearer ${await token('mbt-invitee-2')}`)
      .expect(201);

    const reinvited = asMembership(
      (
        await api(app)
          .post(`/api/v1/agencies/${ownerAgencyId}/members`)
          .set('Authorization', `Bearer ${ownerAuth}`)
          .send({ userId: inviteeId, roles: ['BRANCH_MANAGER'] })
          .expect(201)
      ).body,
    );
    expect(reinvited).toMatchObject({ status: 'INVITED', roles: ['BRANCH_MANAGER'] });
  });

  it('rejects duplicate invitations with MEMBERSHIP_EXISTS', async () => {
    const ownerAuth = await ownerToken();
    const inviteeId = await appUserId('mbt-invitee-3');
    await memberships.invite(ownerAgencyId, inviteeId, ['STAFF_AGENT']);

    const res = await api(app)
      .post(`/api/v1/agencies/${ownerAgencyId}/members`)
      .set('Authorization', `Bearer ${ownerAuth}`)
      .send({ userId: inviteeId, roles: ['STAFF_AGENT'] })
      .expect(409);
    expect((res.body as ApiErrorBody).error.code).toBe('MEMBERSHIP_EXISTS');
  });

  it('a user can belong to multiple agencies with different roles (02-B06)', async () => {
    const userId = await appUserId('mbt-multi');
    await memberships.invite(ownerAgencyId, userId, ['STAFF_AGENT']);
    await memberships.invite(otherAgencyId, userId, ['FINANCE']);

    const rows = await memberships.listForUser(userId);
    const inOwner = rows.find((m) => m.tenantId === ownerAgencyId);
    const inOther = rows.find((m) => m.tenantId === otherAgencyId);
    expect(inOwner?.roles).toEqual(['STAFF_AGENT']);
    expect(inOther?.roles).toEqual(['FINANCE']);
  });

  it('assigns roles to an active membership (02-B04)', async () => {
    const ownerAuth = await ownerToken();
    const userId = await appUserId('mbt-role-assign');
    await memberships.invite(ownerAgencyId, userId, ['STAFF_AGENT']);
    const membership = await memberships
      .listForTenant(ownerAgencyId)
      .then((rows) => rows.find((m) => m.userId === userId));
    if (!membership) throw new Error('membership missing');
    await memberships.accept(userId, membership.id);

    const res = await api(app)
      .patch(`/api/v1/agencies/${ownerAgencyId}/members/${userId}/roles`)
      .set('Authorization', `Bearer ${ownerAuth}`)
      .send({ roles: ['STAFF_AGENT', 'FINANCE'] })
      .expect(200);
    expect(asMembership(res.body).roles).toEqual(['STAFF_AGENT', 'FINANCE']);
  });

  it('rejects non-membership roles with INVALID_ROLE', async () => {
    const ownerAuth = await ownerToken();
    const userId = await appUserId('mbt-bad-role');
    const res = await api(app)
      .post(`/api/v1/agencies/${ownerAgencyId}/members`)
      .set('Authorization', `Bearer ${ownerAuth}`)
      .send({ userId, roles: ['PLATFORM_ADMIN'] })
      .expect(409);
    expect((res.body as ApiErrorBody).error.code).toBe('INVALID_ROLE');
  });

  it('suspends and reactivates a membership (02-B03)', async () => {
    const ownerAuth = await ownerToken();
    const userId = await appUserId('mbt-suspend');
    await memberships.invite(ownerAgencyId, userId, ['STAFF_AGENT']);
    const membership = (await memberships.listForTenant(ownerAgencyId)).find(
      (m) => m.userId === userId,
    );
    if (!membership) throw new Error('membership missing');
    await memberships.accept(userId, membership.id);

    const suspended = asMembership(
      (
        await api(app)
          .patch(`/api/v1/agencies/${ownerAgencyId}/members/${userId}/status`)
          .set('Authorization', `Bearer ${ownerAuth}`)
          .send({ action: 'suspend' })
          .expect(200)
      ).body,
    );
    expect(suspended.status).toBe('SUSPENDED');

    const reactivated = asMembership(
      (
        await api(app)
          .patch(`/api/v1/agencies/${ownerAgencyId}/members/${userId}/status`)
          .set('Authorization', `Bearer ${ownerAuth}`)
          .send({ action: 'reactivate' })
          .expect(200)
      ).body,
    );
    expect(reactivated.status).toBe('ACTIVE');
  });

  it('removes a membership (02-B05)', async () => {
    const ownerAuth = await ownerToken();
    const userId = await appUserId('mbt-remove');
    await memberships.invite(ownerAgencyId, userId, ['STAFF_AGENT']);

    const res = await api(app)
      .delete(`/api/v1/agencies/${ownerAgencyId}/members/${userId}`)
      .set('Authorization', `Bearer ${ownerAuth}`)
      .expect(200);
    expect(res.body).toEqual({ removed: true });

    const rows = await memberships.listForTenant(ownerAgencyId);
    expect(rows.find((m) => m.userId === userId)?.status).toBe('REMOVED');
  });

  it('denies cross-agency membership management (02-B06/02-D preview)', async () => {
    const ownerAuth = await ownerToken();
    const strangerId = await appUserId('mbt-stranger');
    // Owner of ownerAgency must not manage members of otherAgency.
    const res = await api(app)
      .post(`/api/v1/agencies/${otherAgencyId}/members`)
      .set('Authorization', `Bearer ${ownerAuth}`)
      .send({ userId: strangerId, roles: ['STAFF_AGENT'] })
      .expect(403);
    expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });

  it('only the invited user may accept (ownership enforcement)', async () => {
    const ownerAuth = await ownerToken();
    const inviteeId = await appUserId('mbt-own-invite');
    const invited = asMembership(
      (
        await api(app)
          .post(`/api/v1/agencies/${ownerAgencyId}/members`)
          .set('Authorization', `Bearer ${ownerAuth}`)
          .send({ userId: inviteeId, roles: ['STAFF_AGENT'] })
          .expect(201)
      ).body,
    );

    const res = await api(app)
      .post(`/api/v1/memberships/${invited.id}/accept`)
      .set('Authorization', `Bearer ${await token('mbt-someone-else')}`)
      .expect(403);
    expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });

  it('requires staff.manage for membership management (01-D permission enforcement)', async () => {
    // A STAFF_AGENT member cannot invite others.
    const staffSubject = 'mbt-staff-agent';
    const staffId = await appUserId(staffSubject);
    await memberships.invite(ownerAgencyId, staffId, ['STAFF_AGENT']);
    const staffMembership = (await memberships.listForTenant(ownerAgencyId)).find(
      (m) => m.userId === staffId,
    );
    if (!staffMembership) throw new Error('staff membership missing');
    await memberships.accept(staffId, staffMembership.id);

    const targetId = await appUserId('mbt-target');
    const res = await api(app)
      .post(`/api/v1/agencies/${ownerAgencyId}/members`)
      .set('Authorization', `Bearer ${await token(staffSubject)}`)
      .send({ userId: targetId, roles: ['STAFF_AGENT'] })
      .expect(403);
    expect((res.body as ApiErrorBody).error.code).toBe('FORBIDDEN');
  });

  it('blocks invitations into suspended agencies', async () => {
    const suspended = await tenants.create({ name: 'MB Suspended', slug: 'mbt-suspended' });
    await tenants.transitionStatus(suspended.id, 'SUSPENDED');
    const inviteeId = await appUserId('mbt-suspended-invitee');

    await expect(
      memberships.invite(suspended.id, inviteeId, ['STAFF_AGENT']),
    ).rejects.toMatchObject({
      response: { code: 'TENANT_NOT_ACTIVE' },
    });
  });
});
