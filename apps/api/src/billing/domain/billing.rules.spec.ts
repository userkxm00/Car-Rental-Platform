import {
  composeInvoiceItemsFromTotals,
  composeInvoiceNumber,
  deriveFinanceReconciliation,
  formatMinorAmountForDisplay,
  isLedgerLineOrdered,
  type FinanceSource,
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

  describe('deriveFinanceReconciliation (09-B07)', () => {
    const settledSource = (): FinanceSource => ({
      currency: 'DZD',
      snapshot: { totalMinor: 45000, depositMinor: 10000 },
      intent: { status: 'SETTLED', totalMinor: 45000, depositMinor: 10000 },
      records: [
        { id: 'r1', status: 'CONFIRMED', amountMinor: 20000 },
        { id: 'r2', status: 'CONFIRMED', amountMinor: 25000 },
        { id: 'r3', status: 'VOIDED', amountMinor: 5000 },
      ],
      hold: { id: 'h1', status: 'RELEASED', amountMinor: 10000 },
      invoices: [
        { id: 'i1', status: 'VOIDED', totalMinor: 45000 },
        { id: 'i2', status: 'ISSUED', totalMinor: 45000 },
      ],
      ledger: [
        { kind: 'DEPOSIT_HELD', sourceId: 'h1' },
        { kind: 'DEPOSIT_RELEASED', sourceId: 'h1' },
        { kind: 'PAYMENT_CONFIRMED', sourceId: 'r1' },
        { kind: 'PAYMENT_CONFIRMED', sourceId: 'r2' },
        { kind: 'PAYMENT_VOIDED', sourceId: 'r3' },
        { kind: 'INVOICE_ISSUED', sourceId: 'i1' },
        { kind: 'INVOICE_VOIDED', sourceId: 'i1' },
        { kind: 'INVOICE_ISSUED', sourceId: 'i2' },
      ],
    });

    it('reconciles a fully coherent settled booking', () => {
      const result = deriveFinanceReconciliation(settledSource());
      expect(result).toMatchObject({
        currency: 'DZD',
        snapshotPresent: true,
        intentMatchesRecords: true,
        intentMatchesSnapshot: true,
        invoiceMatchesSnapshot: true,
        eventsComplete: true,
        reconciled: true,
      });
    });

    it('reconciles an untouched booking (no intent, no money events)', () => {
      const result = deriveFinanceReconciliation({
        currency: 'DZD',
        snapshot: { totalMinor: 8000, depositMinor: 0 },
        intent: null,
        records: [],
        hold: null,
        invoices: [],
        ledger: [],
      });
      expect(result.reconciled).toBe(true);
    });

    it('reconciles a partially settled booking with the held deposit only', () => {
      const source = settledSource();
      source.records = [{ id: 'r1', status: 'CONFIRMED', amountMinor: 20000 }];
      source.intent = { status: 'PARTIALLY_SETTLED', totalMinor: 45000, depositMinor: 10000 };
      source.hold = { id: 'h1', status: 'HELD', amountMinor: 10000 };
      source.invoices = [];
      source.ledger = [
        { kind: 'DEPOSIT_HELD', sourceId: 'h1' },
        { kind: 'PAYMENT_CONFIRMED', sourceId: 'r1' },
      ];
      expect(deriveFinanceReconciliation(source).reconciled).toBe(true);
    });

    it('flags an intent total that drifted from the snapshot', () => {
      const source = settledSource();
      source.intent = { status: 'SETTLED', totalMinor: 44000, depositMinor: 10000 };
      const result = deriveFinanceReconciliation(source);
      expect(result.intentMatchesSnapshot).toBe(false);
      expect(result.reconciled).toBe(false);
    });

    it('flags an intent status that contradicts the confirmed sum', () => {
      const source = settledSource();
      if (source.intent) {
        source.intent.status = 'OPEN';
      }
      const result = deriveFinanceReconciliation(source);
      expect(result.intentMatchesRecords).toBe(false);
      expect(result.reconciled).toBe(false);
    });

    it('flags an active invoice that no longer totals the snapshot', () => {
      const source = settledSource();
      source.invoices = [{ id: 'i2', status: 'ISSUED', totalMinor: 43000 }];
      source.ledger = source.ledger.filter(
        (row) => !(row.kind === 'INVOICE_ISSUED' && row.sourceId === 'i1'),
      );
      const result = deriveFinanceReconciliation(source);
      expect(result.invoiceMatchesSnapshot).toBe(false);
      expect(result.reconciled).toBe(false);
    });

    it('flags a confirmed record whose ledger event is missing (out-of-band write)', () => {
      const source = settledSource();
      source.ledger = source.ledger.filter(
        (row) => !(row.kind === 'PAYMENT_CONFIRMED' && row.sourceId === 'r2'),
      );
      const result = deriveFinanceReconciliation(source);
      expect(result.eventsComplete).toBe(false);
      expect(result.reconciled).toBe(false);
    });

    it('flags a missing deposit release event', () => {
      const source = settledSource();
      source.ledger = source.ledger.filter((row) => row.kind !== 'DEPOSIT_RELEASED');
      expect(deriveFinanceReconciliation(source).eventsComplete).toBe(false);
    });

    it('never reconciles without a snapshot', () => {
      const source = settledSource();
      source.snapshot = null;
      expect(deriveFinanceReconciliation(source).reconciled).toBe(false);
    });
  });

});
