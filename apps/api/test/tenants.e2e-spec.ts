import { INestApplication, HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { TenantService } from '../src/tenants/application/tenant.service';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';

/**
 * Tenant integration tests (02-A08) — real PostgreSQL.
 *
 * The suite owns the `tnt-` slug namespace and cleans up after itself, so
 * interrupted runs never poison the next one.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';

async function rejectWithEnvelope(
  action: () => Promise<unknown>,
): Promise<{ status: number; body: ApiErrorBody }> {
  try {
    await action();
  } catch (error) {
    if (error instanceof HttpException) {
      const raw = error.getResponse();
      // Service-level exceptions carry the raw payload {code, message};
      // the HTTP layer wraps it into the documented {error:{...}} envelope.
      const body =
        typeof raw === 'object' && raw !== null && 'error' in raw
          ? (raw as ApiErrorBody)
          : { error: raw as ApiErrorBody['error'] };
      return { status: error.getStatus(), body };
    }
    throw error;
  }
  throw new Error('expected the action to reject');
}

describe('Tenants (integration)', () => {
  let app: INestApplication;
  let service: TenantService;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    service = app.get(TenantService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'tnt-' } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('creates a tenant with documented defaults (02-A02)', async () => {
    const tenant = await service.create({ name: 'Alger Cars', slug: 'tnt-alger-cars' });
    expect(tenant).toMatchObject({
      name: 'Alger Cars',
      slug: 'tnt-alger-cars',
      status: 'ACTIVE',
      marketplaceEnabled: false,
      verificationStatus: 'UNVERIFIED',
      defaultLocale: 'en',
      defaultCurrency: 'DZD',
    });
  });

  it('rejects duplicate slugs with SLUG_TAKEN', async () => {
    await service.create({ name: 'Dup', slug: 'tnt-dup' });
    const { body } = await rejectWithEnvelope(() =>
      service.create({ name: 'Dup Again', slug: 'tnt-dup' }),
    );
    expect(body.error.code).toBe('SLUG_TAKEN');
  });

  it('rejects invalid slug shapes before touching the database', async () => {
    const { body } = await rejectWithEnvelope(() =>
      service.create({ name: 'Bad', slug: 'BAD SLUG' }),
    );
    expect(body.error.code).toBe('TENANT_VALIDATION_FAILED');
  });

  it('finds tenants by public slug (02-A04)', async () => {
    await service.create({ name: 'Oran Motors', slug: 'tnt-oran-motors' });
    const bySlug = await service.findBySlug('tnt-oran-motors');
    expect(bySlug.name).toBe('Oran Motors');
    const { body } = await rejectWithEnvelope(() => service.findBySlug('tnt-does-not-exist'));
    expect(body.error.code).toBe('TENANT_NOT_FOUND');
  });

  it('updates tenant settings with validation (02-A05)', async () => {
    const tenant = await service.create({ name: 'Settings Co', slug: 'tnt-settings' });
    const updated = await service.updateSettings(tenant.id, {
      name: 'Settings Co Updated',
      defaultLocale: 'ar',
      defaultTimezone: 'Africa/Algiers',
      defaultCurrency: 'DZD',
    });
    expect(updated).toMatchObject({
      name: 'Settings Co Updated',
      defaultLocale: 'ar',
      defaultTimezone: 'Africa/Algiers',
    });
    const { body } = await rejectWithEnvelope(() =>
      service.updateSettings(tenant.id, { defaultCurrency: 'dzd' }),
    );
    expect(body.error.code).toBe('TENANT_VALIDATION_FAILED');
  });

  it('toggles marketplace participation (02-A06)', async () => {
    const tenant = await service.create({ name: 'Market Co', slug: 'tnt-market' });
    const enabled = await service.setMarketplaceEnabled(tenant.id, true);
    expect(enabled.marketplaceEnabled).toBe(true);
    const disabled = await service.setMarketplaceEnabled(tenant.id, false);
    expect(disabled.marketplaceEnabled).toBe(false);
  });

  it('enforces lifecycle transitions (02-A03)', async () => {
    const tenant = await service.create({ name: 'Lifecycle Co', slug: 'tnt-lifecycle' });

    const suspended = await service.transitionStatus(tenant.id, 'SUSPENDED');
    expect(suspended.status).toBe('SUSPENDED');

    // SUSPENDED → ARCHIVED is not a declared transition.
    const blocked = await rejectWithEnvelope(() => service.transitionStatus(tenant.id, 'ARCHIVED'));
    expect(blocked.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const active = await service.transitionStatus(tenant.id, 'ACTIVE');
    expect(active.status).toBe('ACTIVE');

    const archived = await service.transitionStatus(tenant.id, 'ARCHIVED');
    expect(archived.status).toBe('ARCHIVED');

    // ARCHIVED is terminal.
    const terminal = await rejectWithEnvelope(() => service.transitionStatus(tenant.id, 'ACTIVE'));
    expect(terminal.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('enforces the verification flow (02-A07)', async () => {
    const tenant = await service.create({ name: 'Verify Co', slug: 'tnt-verify' });
    expect(tenant.verificationStatus).toBe('UNVERIFIED');

    const pending = await service.transitionVerification(tenant.id, 'PENDING');
    expect(pending.verificationStatus).toBe('PENDING');

    const verified = await service.transitionVerification(tenant.id, 'VERIFIED');
    expect(verified.verificationStatus).toBe('VERIFIED');

    const { body } = await rejectWithEnvelope(() =>
      service.transitionVerification(tenant.id, 'REJECTED'),
    );
    expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('rejects invalid creation inputs with the documented envelope', async () => {
    const emptyName = await rejectWithEnvelope(() =>
      service.create({ name: '', slug: 'tnt-empty' }),
    );
    expect(emptyName.body.error.code).toBe('TENANT_VALIDATION_FAILED');

    const badLocale = await rejectWithEnvelope(() =>
      service.create({ name: 'X', slug: 'tnt-bad-locale', defaultLocale: 'de' }),
    );
    expect(badLocale.body.error.code).toBe('TENANT_VALIDATION_FAILED');

    const badTimezone = await rejectWithEnvelope(() =>
      service.create({ name: 'X', slug: 'tnt-bad-tz', defaultTimezone: 'not-a-zone' }),
    );
    expect(JSON.stringify(badTimezone.body.error.details)).toContain('defaultTimezone');
  });
});
