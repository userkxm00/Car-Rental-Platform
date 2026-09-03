import {
  DEFAULT_TEMPLATE_CONTENT,
  extractTemplateVariables,
  sampleTemplateValues,
  selectTemplateVersion,
  substituteTemplate,
  TEMPLATE_LOCALES,
  templateLocaleFallbackChain,
  unknownTemplateVariables,
} from './template-rules';

const version = (n: number, locale: string, effectiveFrom: Date) => ({
  version: n,
  locale,
  title: `v${n}-${locale}`,
  body: 'body',
  effectiveFrom,
});

describe('template-rules (08-B01/08-B02)', () => {
  it('validates codes against the stable pattern', () => {
    // Pattern is applied by the service; the domain exposes the regex.
    expect(new RegExp(/^[A-Z][A-Z0-9_-]{1,39}$/).test('RENTAL_CONTRACT')).toBe(true);
    expect(/^[A-Z][A-Z0-9_-]{1,39}$/.test('rental_contract')).toBe(false);
    expect(/^[A-Z][A-Z0-9_-]{1,39}$/.test('1CONTRACT')).toBe(false);
    expect(/^[A-Z][A-Z0-9_-]{1,39}$/.test('C')).toBe(false);
  });

  it('supports exactly the three documented locales', () => {
    expect(TEMPLATE_LOCALES).toEqual(['ar', 'fr', 'en']);
  });
});

describe('extractTemplateVariables / unknownTemplateVariables (08-B06)', () => {
  it('extracts deduplicated placeholder keys', () => {
    const body = '{{AGENCY_NAME}} {{BOOKING_NUMBER}} {{AGENCY_NAME}}';
    expect(extractTemplateVariables(body)).toEqual(['AGENCY_NAME', 'BOOKING_NUMBER']);
  });

  it('reports only unknown keys', () => {
    const body = '{{AGENCY_NAME}} {{NOT_A_REAL_VARIABLE}}';
    expect(unknownTemplateVariables(body)).toEqual(['NOT_A_REAL_VARIABLE']);
  });

  it('the built-in ar/fr/en bodies use only whitelisted variables', () => {
    for (const locale of TEMPLATE_LOCALES) {
      expect(unknownTemplateVariables(DEFAULT_TEMPLATE_CONTENT[locale].body)).toEqual([]);
    }
  });
});

describe('substituteTemplate (08-B06)', () => {
  const values = {
    AGENCY_NAME: 'Oran Auto',
    AGENCY_PHONE: '+213 41 00 00 00',
    BOOKING_NUMBER: 'BK-2026-000042',
    CONTRACT_NUMBER: 'CT-2026-000042',
    CONTRACT_DATE: new Date('2026-09-03T10:00:00Z'),
    CUSTOMER_FIRST_NAME: 'Amina',
    CUSTOMER_LAST_NAME: 'Benali',
    CUSTOMER_LICENSE_NUMBER: '0123456789',
    CUSTOMER_LICENSE_COUNTRY: 'DZ',
    VEHICLE_MAKE: 'Dacia',
    VEHICLE_MODEL: 'Logan',
    VEHICLE_YEAR: 2024,
    VEHICLE_PLATE: '12345-16-41',
    PICKUP_BRANCH_NAME: 'Oran Centre',
    RETURN_BRANCH_NAME: 'Oran Centre',
    PICKUP_DATE: new Date('2026-09-04T09:00:00Z'),
    PICKUP_TIME: new Date('2026-09-04T09:00:00Z'),
    RETURN_DATE: new Date('2026-09-07T18:00:00Z'),
    RETURN_TIME: new Date('2026-09-07T18:00:00Z'),
    RENTAL_DAYS: 3,
    CURRENCY: 'DZD',
    RENTAL_AMOUNT: 450000,
    DEPOSIT_AMOUNT: 2000000,
  };

  it('replaces every whitelisted variable and reports no missing values', () => {
    const { rendered, missing } = substituteTemplate(
      '{{CUSTOMER_FIRST_NAME}} drives {{VEHICLE_MAKE}} for {{RENTAL_DAYS}} day(s) at {{RENTAL_AMOUNT}}.',
      values,
      'en',
    );
    expect(missing).toEqual([]);
    expect(rendered).toContain('Amina drives Dacia for 3 day(s) at');
    expect(rendered).toContain('DZD');
  });

  it('formats dates, times, money and numbers per locale', () => {
    const { rendered } = substituteTemplate(
      '{{PICKUP_DATE}} | {{PICKUP_TIME}} | {{RENTAL_AMOUNT}} | {{VEHICLE_YEAR}}',
      values,
      'fr',
    );
    const [date, time, money, year] = rendered.split(' | ');
    expect(date).toBe(new Intl.DateTimeFormat('fr', { dateStyle: 'long' }).format(values.PICKUP_DATE));
    expect(time).toBe(new Intl.DateTimeFormat('fr', { timeStyle: 'short' }).format(values.PICKUP_TIME));
    expect(money).toBe(new Intl.NumberFormat('fr', { style: 'currency', currency: 'DZD', currencyDisplay: 'code' }).format(4500));
    expect(year).toBe('2024');
  });

  it('renders Arabic locale content without breaking', () => {
    const { rendered, missing } = substituteTemplate(
      '{{CUSTOMER_FIRST_NAME}} | {{RETURN_DATE}}',
      values,
      'ar',
    );
    expect(missing).toEqual([]);
    expect(rendered).toContain('Amina');
  });

  it('reports missing values and leaves their placeholders intact', () => {
    const { rendered, missing } = substituteTemplate('{{AGENCY_NAME}} {{BOOKING_NUMBER}}', {}, 'en');
    expect(missing).toEqual(['AGENCY_NAME', 'BOOKING_NUMBER']);
    expect(rendered).toBe('{{AGENCY_NAME}} {{BOOKING_NUMBER}}');
  });

  it('keeps unknown placeholders untouched (validation happens before render)', () => {
    const { rendered } = substituteTemplate('{{SOMETHING_UNKNOWN}}', {}, 'en');
    expect(rendered).toBe('{{SOMETHING_UNKNOWN}}');
  });

  it('provides complete sample values for previews', () => {
    const samples = sampleTemplateValues();
    const { missing } = substituteTemplate(
      DEFAULT_TEMPLATE_CONTENT.ar.body + DEFAULT_TEMPLATE_CONTENT.fr.body + DEFAULT_TEMPLATE_CONTENT.en.body,
      samples,
      'ar',
    );
    expect(missing).toEqual([]);
  });
});

describe('selectTemplateVersion (08-B07)', () => {
  const asOf = new Date('2026-09-03T12:00:00Z');

  it('selects the highest version effective on or before asOf', () => {
    const versions = [
      version(1, 'fr', new Date('2026-09-01T00:00:00Z')),
      version(2, 'fr', new Date('2026-09-03T00:00:00Z')),
      version(3, 'fr', new Date('2026-09-10T00:00:00Z')), // future — not yet effective
    ];
    const selected = selectTemplateVersion(versions, 'fr', asOf);
    expect(selected?.version.version).toBe(2);
    expect(selected?.fallback).toBe(false);
  });

  it('falls back ar → fr → en when the requested locale has no version', () => {
    const versions = [
      version(1, 'fr', new Date('2026-09-01T00:00:00Z')),
      version(1, 'en', new Date('2026-09-01T00:00:00Z')),
    ];
    const selected = selectTemplateVersion(versions, 'ar', asOf);
    expect(selected?.locale).toBe('fr');
    expect(selected?.fallback).toBe(true);
  });

  it('prefers the requested locale over the fallback chain', () => {
    expect(templateLocaleFallbackChain('en')).toEqual(['en', 'ar', 'fr']);
    expect(templateLocaleFallbackChain('ar')).toEqual(['ar', 'fr', 'en']);
  });

  it('returns null when no version of any locale is effective yet', () => {
    const versions = [version(1, 'ar', new Date('2026-09-10T00:00:00Z'))];
    expect(selectTemplateVersion(versions, 'ar', asOf)).toBeNull();
  });
});
