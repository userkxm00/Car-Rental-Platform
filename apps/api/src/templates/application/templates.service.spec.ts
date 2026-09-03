import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DocumentTemplateVersion } from '@prisma/client';
import { TemplatesService } from './templates.service';
import type { TemplatesRepository } from '../infrastructure/templates.repository';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TEMPLATE = '22222222-2222-4222-8222-222222222222';

const versionRow = (
  version: number,
  locale: 'ar' | 'fr' | 'en',
  effectiveFrom: Date,
  body = '{{AGENCY_NAME}}',
): DocumentTemplateVersion => ({
  id: `${TEMPLATE}-${version}-${locale}`,
  templateId: TEMPLATE,
  version,
  locale,
  title: `v${version}`,
  body,
  effectiveFrom,
  createdAt: new Date('2026-09-01T00:00:00Z'),
});

function makeRepository(overrides: Partial<TemplatesRepository> = {}) {
  return {
    listForTenant: jest.fn(),
    findInTenant: jest.fn(),
    findByCode: jest.fn(),
    createWithVersions: jest.fn(),
    addVersions: jest.fn(),
    ...overrides,
  };
}

const templateRow = (versions: DocumentTemplateVersion[] = []) => ({
  id: TEMPLATE,
  tenantId: TENANT,
  code: 'RENTAL_CONTRACT',
  kind: 'RENTAL_CONTRACT',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  versions,
});

const VALID_INPUT = {
  versions: [
    { locale: 'ar', title: 'عقد إيجار', body: '{{AGENCY_NAME}} {{BOOKING_NUMBER}}' },
    { locale: 'fr', title: 'Contrat', body: '{{AGENCY_NAME}}' },
  ],
};

describe('TemplatesService.list (08-B01)', () => {
  it('reports built-in locales and configured:false when the agency has none', async () => {
    const repository = makeRepository({ listForTenant: jest.fn().mockResolvedValue([]) });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    await expect(service.list(TENANT)).resolves.toEqual({
      templates: [],
      builtInLocales: ['ar', 'fr', 'en'],
      configured: false,
    });
  });

  it('summarizes current effective versions per locale', async () => {
    const repository = makeRepository({
      listForTenant: jest.fn().mockResolvedValue([
        templateRow([
          versionRow(1, 'ar', new Date('2026-09-01T00:00:00Z')),
          versionRow(2, 'fr', new Date('2026-09-01T00:00:00Z')),
          versionRow(3, 'fr', new Date('2030-01-01T00:00:00Z')), // future
        ]),
      ]),
    });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const list = await service.list(TENANT);
    expect(list.configured).toBe(true);
    expect(list.templates[0]).toMatchObject({ code: 'RENTAL_CONTRACT', versionCount: 3 });
    expect(list.templates[0].current).toEqual([
      { locale: 'ar', fallback: false, version: 1, title: 'v1', effectiveFrom: expect.any(String) as string },
      { locale: 'fr', fallback: false, version: 2, title: 'v2', effectiveFrom: expect.any(String) as string },
      // English falls back to the Arabic release (ar → fr → en chain, 08-B07).
      { locale: 'ar', fallback: true, version: 1, title: 'v1', effectiveFrom: expect.any(String) as string },
    ]);
  });
});

describe('TemplatesService.create (08-B01)', () => {
  it('normalizes the code and creates the first release', async () => {
    const createWithVersions = jest.fn().mockResolvedValue(templateRow([versionRow(1, 'ar', new Date())]));
    const repository = makeRepository({ findByCode: jest.fn().mockResolvedValue(null), createWithVersions });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    await service.create(TENANT, { code: ' rental_contract ', versions: VALID_INPUT.versions });
    expect(createWithVersions).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        code: 'RENTAL_CONTRACT',
        kind: 'RENTAL_CONTRACT',
        versions: [
          { locale: 'ar', title: 'عقد إيجار', body: '{{AGENCY_NAME}} {{BOOKING_NUMBER}}' },
          { locale: 'fr', title: 'Contrat', body: '{{AGENCY_NAME}}' },
        ],
      }),
    );
  });

  it('rejects an existing code with TEMPLATE_CODE_EXISTS', async () => {
    const repository = makeRepository({
      findByCode: jest.fn().mockResolvedValue(templateRow()),
    });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const failure = await service
      .create(TENANT, { code: 'RENTAL_CONTRACT', versions: VALID_INPUT.versions })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({ code: 'TEMPLATE_CODE_EXISTS' });
  });

  it('rejects unknown variables with INVALID_TEMPLATE_VARIABLES', async () => {
    const repository = makeRepository({ findByCode: jest.fn().mockResolvedValue(null) });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const failure = await service
      .create(TENANT, {
        code: 'RENTAL_CONTRACT',
        versions: [{ locale: 'ar', title: 't', body: '{{TOTALLY_UNKNOWN}}' }],
      })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'INVALID_TEMPLATE_VARIABLES',
      details: { unknown: ['TOTALLY_UNKNOWN'] },
    });
  });

  it('rejects invalid codes, locales and duplicate locales in one release', async () => {
    const repository = makeRepository({ findByCode: jest.fn().mockResolvedValue(null) });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);

    const badCode = await service
      .create(TENANT, { code: '1bad', versions: VALID_INPUT.versions })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((badCode as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_TEMPLATE_INPUT' });

    const badLocale = await service
      .create(TENANT, { code: 'RENTAL_CONTRACT', versions: [{ locale: 'es', title: 't', body: 'b' }] })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((badLocale as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_TEMPLATE_LOCALE' });

    const duplicate = await service
      .create(TENANT, {
        code: 'RENTAL_CONTRACT',
        versions: [
          { locale: 'ar', title: 'a', body: '{{AGENCY_NAME}}' },
          { locale: 'ar', title: 'b', body: '{{AGENCY_NAME}}' },
        ],
      })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((duplicate as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_TEMPLATE_INPUT' });
  });
});

describe('TemplatesService.addVersion (08-B02)', () => {
  it('releases the next version number without touching existing rows', async () => {
    const addVersions = jest.fn().mockResolvedValue(templateRow([versionRow(1, 'ar', new Date()), versionRow(2, 'ar', new Date())]));
    const repository = makeRepository({
      findInTenant: jest.fn().mockResolvedValue(templateRow([versionRow(1, 'ar', new Date('2026-09-01T00:00:00Z'))])),
      addVersions,
    });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    await service.addVersion(TENANT, TEMPLATE, {
      versions: [{ locale: 'ar', title: 'v2', body: '{{AGENCY_NAME}}' }],
    });
    expect(addVersions).toHaveBeenCalledWith(expect.objectContaining({ templateId: TEMPLATE, version: 2 }));
  });

  it('404s for an unknown template', async () => {
    const repository = makeRepository({ findInTenant: jest.fn().mockResolvedValue(null) });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const failure = await service
      .addVersion(TENANT, TEMPLATE, { versions: VALID_INPUT.versions })
      .then(() => null)
      .catch((error: NotFoundException) => error);
    expect((failure as NotFoundException).getResponse()).toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });
});

describe('TemplatesService.preview (08-B06/08-B07)', () => {
  it('renders the built-in default with sample-filled values when the agency has none', async () => {
    const repository = makeRepository({ listForTenant: jest.fn().mockResolvedValue([]) });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const preview = await service.preview(TENANT, { locale: 'ar' });
    expect(preview.version).toBeNull();
    expect(preview.title).toBe('عقد إيجار مركبة');
    expect(preview.body).not.toContain('{{');
    expect(preview.body).toContain('Sample Agency');
  });

  it('selects the version effective at asOf and substitutes the values', async () => {
    const repository = makeRepository({
      findInTenant: jest.fn().mockResolvedValue(templateRow([versionRow(1, 'ar', new Date('2026-01-01T00:00:00Z'))])),
    });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const preview = await service.preview(TENANT, {
      templateId: TEMPLATE,
      locale: 'ar',
      asOf: new Date().toISOString(),
      variables: { AGENCY_NAME: 'Warda Rent' },
    });
    expect(preview.version).toBe(1);
    expect(preview.body).toBe('Warda Rent');
  });

  it('falls back to the French version when Arabic has none (08-B07)', async () => {
    const repository = makeRepository({
      findInTenant: jest.fn().mockResolvedValue(
        templateRow([versionRow(1, 'fr', new Date('2026-01-01T00:00:00Z'), '{{AGENCY_NAME}}')]),
      ),
    });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const preview = await service.preview(TENANT, {
      templateId: TEMPLATE,
      locale: 'ar',
      variables: { AGENCY_NAME: 'Warda Rent' },
    });
    expect(preview.fallback).toBe(true);
    expect(preview.locale).toBe('fr');
    expect(preview.body).toBe('Warda Rent');
  });

  it('rejects with TEMPLATE_VERSION_MISSING when no version is effective yet', async () => {
    const repository = makeRepository({
      findInTenant: jest.fn().mockResolvedValue(
        templateRow([versionRow(1, 'ar', new Date('2030-01-01T00:00:00Z'))]),
      ),
    });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const failure = await service
      .preview(TENANT, { templateId: TEMPLATE, locale: 'ar' })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({ code: 'TEMPLATE_VERSION_MISSING' });
  });
});

describe('TemplatesService.renderForTenant (08-C bridge)', () => {
  it('renders the built-in content strictly when the agency has no template', async () => {
    const repository = makeRepository({ findByCode: jest.fn().mockResolvedValue(null) });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const rendered = await service.renderForTenant(TENANT, 'RENTAL_CONTRACT', {
      locale: 'en',
      asOf: new Date(),
      values: {
        AGENCY_NAME: 'Warda Rent',
        AGENCY_PHONE: '+213 41 00 00 00',
        BOOKING_NUMBER: 'BK-2026-000001',
        CONTRACT_NUMBER: 'CT-1',
        CONTRACT_DATE: new Date(),
        CUSTOMER_FIRST_NAME: 'A',
        CUSTOMER_LAST_NAME: 'B',
        CUSTOMER_LICENSE_NUMBER: '1',
        CUSTOMER_LICENSE_COUNTRY: 'DZ',
        VEHICLE_MAKE: 'Dacia',
        VEHICLE_MODEL: 'Logan',
        VEHICLE_YEAR: 2024,
        VEHICLE_PLATE: 'P',
        PICKUP_BRANCH_NAME: 'Oran',
        RETURN_BRANCH_NAME: 'Oran',
        PICKUP_DATE: new Date(),
        PICKUP_TIME: new Date(),
        RETURN_DATE: new Date(),
        RETURN_TIME: new Date(),
        RENTAL_DAYS: 1,
        CURRENCY: 'DZD',
        RENTAL_AMOUNT: 100,
        DEPOSIT_AMOUNT: 100,
      },
    });
    expect(rendered.version).toBeNull();
    expect(rendered.body).toContain('Warda Rent');
    expect(rendered.body).not.toContain('{{');
  });

  it('fails loudly when a referenced variable is missing (strict rendering)', async () => {
    const repository = makeRepository({ findByCode: jest.fn().mockResolvedValue(null) });
    const service = new TemplatesService(repository as unknown as TemplatesRepository);
    const failure = await service
      .renderForTenant(TENANT, 'RENTAL_CONTRACT', { locale: 'en', asOf: new Date(), values: {} })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'INVALID_TEMPLATE_INPUT',
      details: { missing: expect.any(Array) as string[] },
    });
  });
});
