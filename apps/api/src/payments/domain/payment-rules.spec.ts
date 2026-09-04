import {
  computeIntentStatus,
  isDepositReleasableStatus,
  isPaymentEligibleStatus,
  isPaymentMethod,
  outstandingMinor,
  validatePaymentRecordInput,
} from './payment-rules';

describe('payment-rules (09-A domain)', () => {
  describe('booking eligibility (09-A04)', () => {
    it('accepts committed bookings only', () => {
      expect(isPaymentEligibleStatus('CONFIRMED')).toBe(true);
      expect(isPaymentEligibleStatus('COMPLETED')).toBe(true);
      expect(isPaymentEligibleStatus('DRAFT')).toBe(false);
      expect(isPaymentEligibleStatus('PENDING_CONFIRMATION')).toBe(false);
      expect(isPaymentEligibleStatus('CANCELLED')).toBe(false);
    });
  });

  describe('intent state (09-A01)', () => {
    it('projects OPEN / PARTIALLY_SETTLED / SETTLED from confirmed money', () => {
      expect(computeIntentStatus(0, 45000)).toBe('OPEN');
      expect(computeIntentStatus(20000, 45000)).toBe('PARTIALLY_SETTLED');
      expect(computeIntentStatus(45000, 45000)).toBe('SETTLED');
      expect(computeIntentStatus(45000, 0)).toBe('SETTLED');
    });

    it('never returns a negative outstanding balance', () => {
      expect(outstandingMinor(0, 45000)).toBe(45000);
      expect(outstandingMinor(45000, 45000)).toBe(0);
      expect(outstandingMinor(60000, 45000)).toBe(0);
    });
  });

  describe('record validation (09-A02/09-A03)', () => {
    it('accepts cash and bank transfer records with evidence', () => {
      expect(validatePaymentRecordInput({ method: 'CASH', amountMinor: 5000 })).toEqual({
        method: 'CASH',
        amountMinor: 5000,
        reference: null,
        note: null,
      });
      expect(
        validatePaymentRecordInput({
          method: 'BANK_TRANSFER',
          amountMinor: 5000,
          reference: '  VIR-2026-0001  ',
        }),
      ).toEqual({ method: 'BANK_TRANSFER', amountMinor: 5000, reference: 'VIR-2026-0001', note: null });
    });

    it('rejects invalid methods, non-positive or non-integer amounts', () => {
      expect(validatePaymentRecordInput({ method: 'CARD', amountMinor: 100 })).toBeNull();
      expect(validatePaymentRecordInput({ method: 'CASH', amountMinor: 0 })).toBeNull();
      expect(validatePaymentRecordInput({ method: 'CASH', amountMinor: -5 })).toBeNull();
      expect(validatePaymentRecordInput({ method: 'CASH', amountMinor: 10.5 })).toBeNull();
      expect(validatePaymentRecordInput({ method: 'CASH', amountMinor: '100' })).toBeNull();
      expect(validatePaymentRecordInput(null)).toBeNull();
    });

    it('requires a bank transfer reference and caps free text', () => {
      expect(validatePaymentRecordInput({ method: 'BANK_TRANSFER', amountMinor: 100 })).toBeNull();
      expect(
        validatePaymentRecordInput({
          method: 'BANK_TRANSFER',
          amountMinor: 100,
          reference: 'x'.repeat(121),
        }),
      ).toBeNull();
      expect(validatePaymentRecordInput({ method: 'CASH', amountMinor: 100, note: 'x'.repeat(501) })).toBeNull();
    });

    it('keeps only supported methods', () => {
      expect(isPaymentMethod('CASH')).toBe(true);
      expect(isPaymentMethod('BANK_TRANSFER')).toBe(true);
      expect(isPaymentMethod('OTHER_MANUAL')).toBe(true);
      expect(isPaymentMethod('CARD')).toBe(false);
      expect(isPaymentMethod(42)).toBe(false);
    });
  });

  describe('deposit release (09-A06)', () => {
    it('releases only after the rental returns', () => {
      expect(isDepositReleasableStatus('RETURNED')).toBe(true);
      expect(isDepositReleasableStatus('SETTLEMENT_PENDING')).toBe(true);
      expect(isDepositReleasableStatus('COMPLETED')).toBe(true);
      expect(isDepositReleasableStatus('ACTIVE')).toBe(false);
      expect(isDepositReleasableStatus('CONFIRMED')).toBe(false);
    });
  });
});
