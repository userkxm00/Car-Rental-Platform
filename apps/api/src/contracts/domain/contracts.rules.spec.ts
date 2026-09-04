import {
  contentHashOf,
  contractNumberOf,
  isIssuableBookingStatus,
  isValidContentHash,
  parseBookingTotals,
  receiptNumberOf,
  resolveContractLocale,
} from './contracts.rules';

describe('contracts.rules (08-C domain)', () => {
  describe('issuable booking statuses', () => {
    it('accepts committed lifecycle statuses only', () => {
      for (const status of ['CONFIRMED', 'READY_FOR_PICKUP', 'ACTIVE', 'COMPLETED']) {
        expect(isIssuableBookingStatus(status)).toBe(true);
      }
      for (const status of ['DRAFT', 'HOLD', 'PENDING_CONFIRMATION', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'REJECTED']) {
        expect(isIssuableBookingStatus(status)).toBe(false);
      }
    });
  });

  describe('numbering', () => {
    it('derives contract and receipt numbers from the booking number', () => {
      expect(contractNumberOf('BN-2026-0042')).toBe('CT-BN-2026-0042');
      expect(receiptNumberOf('BN-2026-0042')).toBe('RT-BN-2026-0042');
    });
  });

  describe('locale resolution', () => {
    it('keeps supported locales, defaults to Arabic (08-B03 first-class)', () => {
      expect(resolveContractLocale('fr')).toBe('fr');
      expect(resolveContractLocale('en')).toBe('en');
      expect(resolveContractLocale('ar')).toBe('ar');
      expect(resolveContractLocale('de')).toBe('ar');
      expect(resolveContractLocale(null)).toBe('ar');
      expect(resolveContractLocale(undefined)).toBe('ar');
    });
  });

  describe('booking totals', () => {
    it('parses the confirmation price snapshot', () => {
      expect(
        parseBookingTotals({ currency: 'DZD', totalMinor: 45000, depositMinor: 10000, calculatedAt: 'x' }),
      ).toEqual({ currency: 'DZD', totalMinor: 45000, depositMinor: 10000 });
    });

    it('defaults a missing deposit to zero (truthful: nothing held)', () => {
      expect(parseBookingTotals({ currency: 'DZD', totalMinor: 45000 })).toEqual({
        currency: 'DZD',
        totalMinor: 45000,
        depositMinor: 0,
      });
    });

    it('rejects absent, malformed or negative snapshots', () => {
      expect(parseBookingTotals(null)).toBeNull();
      expect(parseBookingTotals(undefined)).toBeNull();
      expect(parseBookingTotals({})).toBeNull();
      expect(parseBookingTotals({ currency: 'DZD' })).toBeNull();
      expect(parseBookingTotals({ currency: 'DZD', totalMinor: '45000' })).toBeNull();
      expect(parseBookingTotals({ currency: 'DZD', totalMinor: -5 })).toBeNull();
      expect(parseBookingTotals({ currency: 'DZD', totalMinor: 45.5 })).toBeNull();
      expect(parseBookingTotals({ currency: 'DZD', totalMinor: 10, depositMinor: -1 })).toBeNull();
    });
  });

  describe('content integrity', () => {
    it('hashes deterministic lowercase-hex sha256', () => {
      expect(contentHashOf('abc')).toBe(contentHashOf('abc'));
      expect(contentHashOf('abc')).not.toBe(contentHashOf('abd'));
      expect(isValidContentHash(contentHashOf('abc'))).toBe(true);
      expect(isValidContentHash('zz')).toBe(false);
      expect(isValidContentHash(42)).toBe(false);
    });
  });
});
