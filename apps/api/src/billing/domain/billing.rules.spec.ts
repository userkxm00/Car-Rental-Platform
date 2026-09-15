import {
  composeInvoiceItemsFromTotals,
  composeInvoiceNumber,
  formatMinorAmountForDisplay,
  isLedgerLineOrdered,
} from './billing.rules';

describe('billing domain rules', () => {
  describe('composeInvoiceItemsFromTotals', () => {
    it('splits deposit and rental from the immutable snapshot totals', () => {
      const plan = composeInvoiceItemsFromTotals({
        currency: 'DZD',
        totalMinor: 45000,
        depositMinor: 10000,
      });
      expect(plan.currency).toBe('DZD');
      expect(plan.totalMinor).toBe(45000);
      expect(plan.items).toHaveLength(2);
      expect(plan.items[0]).toMatchObject({ kind: 'DEPOSIT', amountMinor: 10000 });
      expect(plan.items[1]).toMatchObject({ kind: 'RENTAL', amountMinor: 35000 });
    });

    it('produces a rental-only plan when there is no deposit', () => {
      const plan = composeInvoiceItemsFromTotals({
        currency: 'DZD',
        totalMinor: 30000,
        depositMinor: 0,
      });
      expect(plan.items).toHaveLength(1);
      expect(plan.items[0]).toMatchObject({ kind: 'RENTAL', amountMinor: 30000 });
    });

    it('keeps the item sum exactly equal to the snapshot total', () => {
      for (const [totalMinor, depositMinor] of [
        [45000, 10000],
        [30000, 0],
        [999999999, 1234567],
      ] as const) {
        const plan = composeInvoiceItemsFromTotals({ currency: 'DZD', totalMinor, depositMinor });
        const sum = plan.items.reduce((acc, item) => acc + item.amountMinor, 0);
        expect(sum).toBe(totalMinor);
      }
    });
  });

  describe('composeInvoiceNumber', () => {
    it('renders a zero-padded sequence per booking', () => {
      expect(composeInvoiceNumber('BR-2026-0042', 1)).toBe('INV-BR-2026-0042-001');
      expect(composeInvoiceNumber('BR-2026-0042', 17)).toBe('INV-BR-2026-0042-017');
      expect(composeInvoiceNumber('BR-2026-0042', 100)).toBe('INV-BR-2026-0042-100');
    });
  });

  describe('isLedgerLineOrdered', () => {
    it('accepts a first line without a predecessor', () => {
      expect(isLedgerLineOrdered(new Date('2026-09-04T10:00:00Z'), null)).toBe(true);
    });

    it('accepts chronological or equal timestamps and rejects regression', () => {
      const base = new Date('2026-09-04T10:00:00Z');
      expect(isLedgerLineOrdered(new Date('2026-09-04T10:00:01Z'), base)).toBe(true);
      expect(isLedgerLineOrdered(new Date('2026-09-04T10:00:00Z'), base)).toBe(true);
      expect(isLedgerLineOrdered(new Date('2026-09-04T09:59:59Z'), base)).toBe(false);
    });
  });

  describe('formatMinorAmountForDisplay', () => {
    it('formats DZD amounts in the Algerian locale with the currency code', () => {
      expect(formatMinorAmountForDisplay('DZD', 123456)).toBe('1 234,56 DZD');
    });

    it('honours the TND three-decimal precision', () => {
      expect(formatMinorAmountForDisplay('TND', 1234567)).toBe('1 234,567 TND');
    });

    it('formats zero without sign', () => {
      expect(formatMinorAmountForDisplay('DZD', 0)).toBe('0,00 DZD');
    });
  });
});
