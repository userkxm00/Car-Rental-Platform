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
import type { Test as SuperTest } from 'supertest';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * PHASE-08 / 08-B integration: versioned contract templates — CRUD with
 * append-only releases (08-B01/08-B02), the built-in ar/fr/en defaults
 * (08-B03..B05), whitelisted substitution (08-B06) and the effective-date
 * version selection rules (08-B07), with tenant isolation throughout.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4171;

interface TemplateListBody {
  templates: Array<{
    templateId: string;
    code: string;
    versionCount: number;
    current: Array<{ locale: string; fallback: boolean; version: number }>;
  }>;
  builtInLocales: string[];
  configured: boolean;
}

interface TemplateBody {
  templateId: string;
  code: string;
  kind: string;
  versions: Array<{ version: number; locale: string; title: string; body: string; effectiveFrom: string }>;
}

interface PreviewBody {
  locale: string;
  fallback: boolean;
  version: number | null;
  title: string;
  body: string;
}

describe('Contract templates (08-B, integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let memberships: MembershipService;
  let agencyId: string;
  let otherAgencyId: string;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const env = loadEnvSchema({
      NODE_ENV: 'test',
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      TEST_DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(env)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    tenants = app.get(TenantService);
    memberships = app.get(MembershipService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'tpl-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function errorOf(test: SuperTest): Promise<{ status: number; code: string }> {
    const response = await test;
    return { status: response.status, code: (response.body as ApiErrorBody).error.code };
  }

  async function createTenant(slugPrefix: string): Promise<{ id: string; slug: string }> {
    const slug = `tpl-${slugPrefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await tenants.create({ name: `Templates ${slug}`, slug });
    return { id: tenant.id, slug };
  }

  async function token(subject: string): Promise<string> {
    return jwks.signToken({ sub: subject, email: `${subject}@kavriqo.test`, email_verified: true });
  }

  async function appUserId(subject: string): Promise<string> {
    const res = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${await token(subject)}`)
      .expect(200);
    return (res.body as { id: string }).id;
  }

  async function agencyToken(subject: string, tenantId: string): Promise<string> {
    const userId = await appUserId(subject);
    const existing = (await memberships.listForTenant(tenantId)).find((m) => m.userId === userId);
    if (!existing) {
      await memberships.invite(tenantId, userId, ['AGENCY_OWNER_ADMIN']);
      const membership = (await memberships.listForTenant(tenantId)).find(
        (m) => m.userId === userId,
      );
      if (membership) {
        await memberships.accept(userId, membership.id);
      }
    }
    return token(subject);
  }

  const getAs = (bearer: string, url: string) =>
    api(app).get(url).set('Authorization', `Bearer ${bearer}`);
  const postAs = (bearer: string, url: string) =>
    api(app).post(url).set('Authorization', `Bearer ${bearer}`);

  const base = () => `/api/v1/agencies/${agencyId}/document-templates`;

  const VERSIONS = [
    { locale: 'ar', title: 'عقد إيجار مركبة', body: '{{AGENCY_NAME}} {{BOOKING_NUMBER}}' },
    { locale: 'fr', title: 'Contrat de location', body: '{{AGENCY_NAME}} {{VEHICLE_MAKE}}' },
    { locale: 'en', title: 'Rental agreement', body: '{{AGENCY_NAME}} {{VEHICLE_MODEL}}' },
  ];

  beforeAll(async () => {
    agencyId = (await createTenant('a')).id;
    otherAgencyId = (await createTenant('b')).id;
  });

  it('lists the built-in defaults until the agency releases a template, tenant-scoped (08-B01)', async () => {
    const list = await getAs(await agencyToken('tpl-owner', agencyId), base()).expect(200);
    expect(list.body as TemplateListBody).toEqual({
      templates: [],
      builtInLocales: ['ar', 'fr', 'en'],
      configured: false,
    });

    const unauth = await errorOf(api(app).get(base()));
    expect(unauth.status).toBe(401);

    const cross = await errorOf(getAs(await agencyToken('tpl-other', otherAgencyId), base()));
    expect(cross.status).toBe(403);
  });

  it('renders the built-in Arabic contract with sample-filled variables (08-B03/08-B06)', async () => {
    const preview = await postAs(await agencyToken('tpl-owner', agencyId), `${base()}/preview`)
      .send({ locale: 'ar' })
      .expect(201);
    const body = preview.body as PreviewBody;
    expect(body.version).toBeNull();
    expect(body.title).toBe('عقد إيجار مركبة');
    expect(body.body).toContain('Sample Agency');
    expect(body.body).not.toContain('{{');
  });

  it('creates a template with the first release and rejects bad input (08-B01/08-B06)', async () => {
    const created = await postAs(await agencyToken('tpl-owner', agencyId), base())
      .send({ code: ' rental_contract ', versions: VERSIONS })
      .expect(201);
    const template = created.body as TemplateBody;
    expect(template.code).toBe('RENTAL_CONTRACT');
    expect(template.versions).toHaveLength(3);

    const duplicate = await errorOf(
      postAs(await agencyToken('tpl-owner', agencyId), base()).send({ code: 'RENTAL_CONTRACT', versions: VERSIONS }),
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.code).toBe('TEMPLATE_CODE_EXISTS');

    const unknownVar = await errorOf(
      postAs(await agencyToken('tpl-owner', agencyId), base()).send({
        code: 'SECOND',
        versions: [{ locale: 'ar', title: 't', body: '{{NOT_WHITELISTED}}' }],
      }),
    );
    expect(unknownVar.status).toBe(409);
    expect(unknownVar.code).toBe('INVALID_TEMPLATE_VARIABLES');

    const badLocale = await errorOf(
      postAs(await agencyToken('tpl-owner', agencyId), base()).send({
        code: 'THIRD',
        versions: [{ locale: 'es', title: 't', body: '{{AGENCY_NAME}}' }],
      }),
    );
    expect(badLocale.status).toBe(409);
    expect(badLocale.code).toBe('INVALID_TEMPLATE_LOCALE');
  });

  it('releases the next version without touching earlier rows (08-B02)', async () => {
    const created = await postAs(await agencyToken('tpl-owner', agencyId), base())
      .send({ code: 'AGREEMENT_V2', versions: VERSIONS.slice(0, 1) })
      .expect(201);
    const templateId = (created.body as TemplateBody).templateId;

    const v2 = await postAs(await agencyToken('tpl-owner', agencyId), `${base()}/${templateId}/versions`)
      .send({
        effectiveFrom: new Date(Date.now() + 24 * 3600_000).toISOString(),
        versions: [{ locale: 'fr', title: 'Contrat v2', body: '{{AGENCY_NAME}} v2' }],
      })
      .expect(201);
    const body = v2.body as TemplateBody;
    expect(body.versions).toHaveLength(2);
    expect(body.versions.map((v) => v.version)).toEqual([1, 2]);

    const read = await getAs(await agencyToken('tpl-owner', agencyId), `${base()}/${templateId}`).expect(200);
    expect((read.body as TemplateBody).versions.map((v) => v.version)).toEqual([1, 2]);
  });

  it('selects the version effective at the requested date with locale fallback (08-B07)', async () => {
    // French-only template: Arabic requests must fall back to French.
    const created = await postAs(await agencyToken('tpl-owner', agencyId), base())
      .send({
        code: 'SELECTION_TEST',
        effectiveFrom: new Date(Date.now() - 24 * 3600_000).toISOString(),
        versions: [{ locale: 'fr', title: 'Contrat v1', body: '{{AGENCY_NAME}} {{BOOKING_NUMBER}}' }],
      })
      .expect(201);
    const templateId = (created.body as TemplateBody).templateId;

    const variables = { AGENCY_NAME: 'Warda Rent', BOOKING_NUMBER: 'BK-2026-000042' };

    // asOf now: the French v1 is effective; Arabic falls back to it.
    const now = await postAs(await agencyToken('tpl-owner', agencyId), `${base()}/preview`)
      .send({ templateId, locale: 'ar', variables })
      .expect(201);
    expect(now.body as PreviewBody).toMatchObject({ locale: 'fr', fallback: true, version: 1 });
    expect((now.body as PreviewBody).body).toBe('Warda Rent BK-2026-000042');

    // v2 becomes effective tomorrow.
    await postAs(await agencyToken('tpl-owner', agencyId), `${base()}/${templateId}/versions`)
      .send({
        effectiveFrom: new Date(Date.now() + 24 * 3600_000).toISOString(),
        versions: [{ locale: 'fr', title: 'Contrat v2', body: '{{AGENCY_NAME}} V2-{{BOOKING_NUMBER}}' }],
      })
      .expect(201);

    // Today still resolves to v1 (highest version effective on or before asOf).
    const today = await postAs(await agencyToken('tpl-owner', agencyId), `${base()}/preview`)
      .send({ templateId, locale: 'fr', variables })
      .expect(201);
    expect(today.body as PreviewBody).toMatchObject({ locale: 'fr', fallback: false, version: 1 });

    // After the v2 effectiveFrom, Arabic falls back to the French v2.
    const future = await postAs(await agencyToken('tpl-owner', agencyId), `${base()}/preview`)
      .send({
        templateId,
        locale: 'ar',
        asOf: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(),
        variables,
      })
      .expect(201);
    expect(future.body as PreviewBody).toMatchObject({ locale: 'fr', fallback: true, version: 2 });
    expect((future.body as PreviewBody).body).toBe('Warda Rent V2-BK-2026-000042');
  });

  it('rejects TEMPLATE_VERSION_MISSING when nothing is effective yet (08-B07)', async () => {
    const created = await postAs(await agencyToken('tpl-owner', agencyId), base())
      .send({
        code: 'FUTURE_ONLY',
        effectiveFrom: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
        versions: VERSIONS.slice(0, 1),
      })
      .expect(201);
    const templateId = (created.body as TemplateBody).templateId;

    const failure = await errorOf(
      postAs(await agencyToken('tpl-owner', agencyId), `${base()}/preview`).send({ templateId, locale: 'ar' }),
    );
    expect(failure.status).toBe(409);
    expect(failure.code).toBe('TEMPLATE_VERSION_MISSING');
  });

  it('404s unknown and cross-tenant template reads (tenant isolation)', async () => {
    const missing = await errorOf(
      getAs(await agencyToken('tpl-owner', agencyId), `${base()}/22222222-2222-4222-8222-222222222222`),
    );
    expect(missing.status).toBe(404);
    expect(missing.code).toBe('TEMPLATE_NOT_FOUND');

    // A template of agency A must not resolve through agency B's path.
    const listA = await getAs(await agencyToken('tpl-owner', agencyId), base()).expect(200);
    const templateIdA = (listA.body as TemplateListBody).templates[0].templateId;
    const crossRead = await errorOf(
      getAs(
        await agencyToken('tpl-other', otherAgencyId),
        `/api/v1/agencies/${otherAgencyId}/document-templates/${templateIdA}`,
      ),
    );
    expect(crossRead.status).toBe(404);
    expect(crossRead.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('summarizes the effective current version per locale with fallback flags (08-B07)', async () => {
    const list = await getAs(await agencyToken('tpl-owner', agencyId), base()).expect(200);
    const body = list.body as TemplateListBody;
    expect(body.configured).toBe(true);
    const contract = body.templates.find((t) => t.code === 'RENTAL_CONTRACT');
    expect(contract?.versionCount).toBe(3);
    expect(contract?.current).toEqual([
      expect.objectContaining({ locale: 'ar', fallback: false, version: 1 }),
      expect.objectContaining({ locale: 'fr', fallback: false, version: 1 }),
      expect.objectContaining({ locale: 'en', fallback: false, version: 1 }),
    ]);
  });
});
