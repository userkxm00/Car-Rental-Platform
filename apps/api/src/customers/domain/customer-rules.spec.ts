import {
  computeDocumentRequirements,
  isExpiredDocument,
  licenseDatesAreOrdered,
  parseCustomerPatch,
  parseDocumentPatch,
  RECENTLY_VIEWED_CAP,
  REQUIRED_DOCUMENT_TYPES,
  SEARCH_HISTORY_CAP,
} from './customer-rules';

const NOW = new Date('2026-09-01T10:00:00.000Z');

describe('customer profile rules (07-A01/07-A03)', () => {
  it('parses a fully valid customer patch', () => {
    const result = parseCustomerPatch(
      {
        firstName: '  Amina ',
        lastName: 'Bouzid',
        phone: '+213 555 12 34 56',
        email: '  AMINA@EXAMPLE.COM ',
        preferredLocale: 'ar',
        dateOfBirth: '1990-05-12',
        licenseNumber: '123456789',
        licenseCountry: 'dz',
        licenseIssueDate: '2020-01-10',
        licenseExpiryDate: '2030-01-10',
      },
      NOW,
    );
    expect(result.failures).toEqual([]);
    expect(result.value).toMatchObject({
      firstName: 'Amina',
      lastName: 'Bouzid',
      email: 'amina@example.com',
      preferredLocale: 'ar',
    });
    expect(result.value.licenseCountry).toBe('DZ');
  });

  it('normalizes empty optional fields to null', () => {
    const result = parseCustomerPatch({ phone: '', email: null, licenseNumber: '' }, NOW);
    expect(result.failures).toEqual([]);
    expect(result.value).toMatchObject({ phone: null, email: null, licenseNumber: null });
  });

  it('rejects missing/invalid names', () => {
    const missing = parseCustomerPatch({}, NOW);
    expect(missing.failures.length).toBe(0); // PATCH semantics: absent keys are untouched
    const blank = parseCustomerPatch({ firstName: '   ' }, NOW);
    expect(blank.failures[0]).toMatchObject({ code: 'CUSTOMER_NAME_INVALID', field: 'firstName' });
    const weird = parseCustomerPatch({ lastName: '<script>' }, NOW);
    expect(weird.failures[0]).toMatchObject({ code: 'CUSTOMER_NAME_INVALID' });
    const tooLong = parseCustomerPatch({ lastName: 'x'.repeat(81) }, NOW);
    expect(tooLong.failures[0]).toMatchObject({ code: 'CUSTOMER_NAME_INVALID' });
  });

  it('rejects invalid phone formats', () => {
    expect(parseCustomerPatch({ phone: '123' }, NOW).failures[0]?.code).toBe('CUSTOMER_PHONE_INVALID');
    expect(parseCustomerPatch({ phone: 'abc-123' }, NOW).failures[0]?.code).toBe('CUSTOMER_PHONE_INVALID');
    expect(parseCustomerPatch({ phone: 55123456 }, NOW).failures[0]?.code).toBe('CUSTOMER_PHONE_INVALID');
  });

  it('rejects invalid emails and lowercases valid ones', () => {
    expect(parseCustomerPatch({ email: 'not-an-email' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_EMAIL_INVALID',
    );
    expect(parseCustomerPatch({ email: 'A@B.COM' }, NOW).value.email).toBe('a@b.com');
  });

  it('rejects unsupported locales', () => {
    expect(parseCustomerPatch({ preferredLocale: 'de' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_LOCALE_INVALID',
    );
    for (const locale of ['ar', 'fr', 'en']) {
      expect(parseCustomerPatch({ preferredLocale: locale }, NOW).failures).toEqual([]);
    }
  });

  it('rejects malformed and future birthdates', () => {
    expect(parseCustomerPatch({ dateOfBirth: '2026-13-40' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_BIRTHDATE_INVALID',
    );
    expect(parseCustomerPatch({ dateOfBirth: '2026-02-30' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_BIRTHDATE_INVALID',
    );
    expect(parseCustomerPatch({ dateOfBirth: '2030-01-01' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_BIRTHDATE_INVALID',
    );
  });

  it('rejects invalid license fields', () => {
    expect(parseCustomerPatch({ licenseCountry: 'Algeria' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_LICENSE_INVALID',
    );
    expect(parseCustomerPatch({ licenseCountry: 'DZ' }, NOW).failures).toEqual([]);
    expect(parseCustomerPatch({ licenseNumber: 42 }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_LICENSE_INVALID',
    );
    expect(parseCustomerPatch({ licenseIssueDate: 'not-a-date' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_LICENSE_INVALID',
    );
  });

  it('enforces license issue ≤ expiry across current and patched values', () => {
    const ordered = licenseDatesAreOrdered(
      { licenseIssueDate: new Date('2020-01-01'), licenseExpiryDate: new Date('2030-01-01') },
      { licenseIssueDate: new Date('2025-01-01') },
    );
    expect(ordered).toBe(true);
    const unordered = licenseDatesAreOrdered(
      { licenseIssueDate: new Date('2020-01-01'), licenseExpiryDate: new Date('2030-01-01') },
      { licenseIssueDate: new Date('2035-01-01') },
    );
    expect(unordered).toBe(false);
    const partialIsFine = licenseDatesAreOrdered(
      { licenseIssueDate: new Date('2020-01-01'), licenseExpiryDate: null },
      { licenseExpiryDate: new Date('2030-01-01') },
    );
    expect(partialIsFine).toBe(true);
  });

  it('validates status values', () => {
    expect(parseCustomerPatch({ status: 'GONE' }, NOW).failures[0]?.code).toBe(
      'CUSTOMER_STATUS_INVALID',
    );
    expect(parseCustomerPatch({ status: 'SUSPENDED' }, NOW).failures).toEqual([]);
  });
});

describe('document rules (07-A04)', () => {
  it('parses a valid document patch', () => {
    const result = parseDocumentPatch(
      { type: 'DRIVER_LICENSE', number: '987654321', issueDate: '2018-02-01', expiryDate: '2028-02-01' },
      NOW,
    );
    expect(result.failures).toEqual([]);
    expect(result.value.type).toBe('DRIVER_LICENSE');
    expect(result.value.expiryDate).toBeInstanceOf(Date);
  });

  it('rejects unknown document types and invalid numbers', () => {
    expect(parseDocumentPatch({ type: 'ID_CARD' }, NOW).failures[0]?.code).toBe(
      'DOCUMENT_TYPE_INVALID',
    );
    expect(parseDocumentPatch({ number: 'x'.repeat(65) }, NOW).failures[0]?.code).toBe(
      'DOCUMENT_NUMBER_INVALID',
    );
  });

  it('rejects issue/expiry date ordering problems', () => {
    expect(
      parseDocumentPatch({ issueDate: '2028-01-01', expiryDate: '2020-01-01' }, NOW).failures[0]
        ?.code,
    ).toBe('DOCUMENT_DATES_INVALID');
    // Issue date must not be in the future.
    expect(parseDocumentPatch({ issueDate: '2031-01-01' }, NOW).failures[0]?.code).toBe(
      'DOCUMENT_DATES_INVALID',
    );
  });

  it('detects expired documents only when the expiry date has passed', () => {
    expect(isExpiredDocument(new Date('2026-08-31'), NOW)).toBe(true);
    expect(isExpiredDocument(new Date('2026-09-01'), NOW)).toBe(false);
    expect(isExpiredDocument(null, NOW)).toBe(false);
  });

  it('computes the baseline requirements state', () => {
    expect(REQUIRED_DOCUMENT_TYPES).toEqual(['DRIVER_LICENSE']);
    const none = computeDocumentRequirements([], NOW);
    expect(none).toEqual({
      requiredTypes: ['DRIVER_LICENSE'],
      satisfied: false,
      unmet: [{ type: 'DRIVER_LICENSE', reason: 'MISSING' }],
    });

    const pending = computeDocumentRequirements(
      [{ type: 'DRIVER_LICENSE', status: 'PENDING', expiryDate: new Date('2030-01-01') }],
      NOW,
    );
    expect(pending.unmet).toEqual([{ type: 'DRIVER_LICENSE', reason: 'PENDING' }]);
    expect(pending.satisfied).toBe(false);

    const rejected = computeDocumentRequirements(
      [{ type: 'DRIVER_LICENSE', status: 'REJECTED', expiryDate: null }],
      NOW,
    );
    expect(rejected.unmet).toEqual([{ type: 'DRIVER_LICENSE', reason: 'REJECTED' }]);

    const expired = computeDocumentRequirements(
      [{ type: 'DRIVER_LICENSE', status: 'VERIFIED', expiryDate: new Date('2026-01-01') }],
      NOW,
    );
    expect(expired.unmet).toEqual([{ type: 'DRIVER_LICENSE', reason: 'EXPIRED' }]);

    const satisfied = computeDocumentRequirements(
      [
        { type: 'DRIVER_LICENSE', status: 'VERIFIED', expiryDate: new Date('2030-01-01') },
        { type: 'PASSPORT', status: 'PENDING', expiryDate: null },
      ],
      NOW,
    );
    expect(satisfied).toEqual({
      requiredTypes: ['DRIVER_LICENSE'],
      satisfied: true,
      unmet: [],
    });
  });
});

describe('signal caps (07-A06/07-A07)', () => {
  it('keeps the documented cap values', () => {
    expect(RECENTLY_VIEWED_CAP).toBe(20);
    expect(SEARCH_HISTORY_CAP).toBe(50);
  });
});
