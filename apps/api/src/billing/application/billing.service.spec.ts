import { BillingService } from './billing.service';

const customerContext = {
  bookingNumber: 'BR-2026-0042',
  tenantId: 'tenant-a',
  currency: 'DZD',
  status: 'CONFIRMED',
  snapshot: { currency: 'DZD', totalMinor: 45000, depositMinor: 10000 },
};

const draftContext = { ...customerContext, status: 'DRAFT' };
const noSnapshotContext = { ...customerContext, snapshot: null };

function repositoryMock() {
  return {
    findBookingFinanceContextForCustomer: jest.fn(),
    findBookingFinanceContextForUser: jest.fn(),
    bookingExistsInTenant: jest.fn(),
    findLedger: jest.fn(),
    findInvoices: jest.fn(),
    issueInvoice: jest.fn(),
    voidInvoice: jest.fn(),
  };
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-BR-2026-0042-001',
    status: 'ISSUED',
    currency: 'DZD',
    totalMinor: 45000,
    createdAt: new Date('2026-09-04T10:00:00Z'),
    voidedAt: null,
    items: [
      { kind: 'DEPOSIT', description: 'Deposit on booking start', amountMinor: 10000 },
      { kind: 'RENTAL', description: 'Rental charges', amountMinor: 35000 },
    ],
    ...overrides,
  };
}

describe('BillingService', () => {
  let repository: ReturnType<typeof repositoryMock>;
  let service: BillingService;

  beforeEach(() => {
    repository = repositoryMock();
    repository.bookingExistsInTenant.mockResolvedValue(true);
    service = new BillingService(repository as never);
  });

  describe('getBookingLedger', () => {
    it('404s when the booking is not in the tenant', async () => {
      repository.bookingExistsInTenant.mockResolvedValue(false);
      await expect(service.getBookingLedger('tenant-a', 'bk-x')).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.findLedger).not.toHaveBeenCalled();
    });

    it('projects repository rows to ISO-serialised entries', async () => {
      repository.findLedger.mockResolvedValue([
        {
          id: 'l1',
          kind: 'PAYMENT_CONFIRMED',
          description: 'Counter cash',
          amountMinor: 20000,
          sourceType: 'PAYMENT_RECORD',
          sourceId: 'r1',
          createdAt: new Date('2026-09-04T09:00:00Z'),
        },
      ]);
      const entries = await service.getBookingLedger('tenant-a', 'bk-1');
      expect(entries).toEqual([
        expect.objectContaining({
          id: 'l1',
          kind: 'PAYMENT_CONFIRMED',
          amountMinor: 20000,
          sourceId: 'r1',
          createdAt: '2026-09-04T09:00:00.000Z',
        }),
      ]);
      expect(repository.findLedger).toHaveBeenCalledWith('tenant-a', 'bk-1');
    });
  });

  describe('getBookingLedgerForCustomer', () => {
    it('404s when the booking is not the customer’s own', async () => {
      repository.findBookingFinanceContextForCustomer.mockResolvedValue(null);
      await expect(service.getBookingLedgerForCustomer('u-1', 'bk-1')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('reads the ledger for the customer’s own booking', async () => {
      repository.findBookingFinanceContextForCustomer.mockResolvedValue(customerContext);
      repository.findLedger.mockResolvedValue([]);
      await expect(service.getBookingLedgerForCustomer('u-1', 'bk-1')).resolves.toEqual([]);
      expect(repository.findLedger).toHaveBeenCalledWith('tenant-a', 'bk-1');
    });
  });

  describe('getBookingInvoices / ForCustomer', () => {
    it('projects invoice rows with items', async () => {
      repository.findInvoices.mockResolvedValue([invoiceRow()]);
      const invoices = await service.getBookingInvoices('tenant-a', 'bk-1');
      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({
        invoiceNumber: 'INV-BR-2026-0042-001',
        status: 'ISSUED',
        totalMinor: 45000,
        createdAt: '2026-09-04T10:00:00.000Z',
      });
      expect(invoices[0]?.items).toContainEqual({
        kind: 'RENTAL',
        description: 'Rental charges',
        amountMinor: 35000,
      });
    });

    it('404s for a stranger booking on the me-portal path', async () => {
      repository.findBookingFinanceContextForCustomer.mockResolvedValue(null);
      await expect(service.getBookingInvoicesForCustomer('u-2', 'bk-1')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('issueInvoice', () => {
    it('composes items from the immutable snapshot and returns the invoice', async () => {
      repository.findBookingFinanceContextForUser.mockResolvedValue(customerContext);
      repository.issueInvoice.mockResolvedValue({ outcome: 'CREATED', invoice: invoiceRow(), voidedPreviousId: null });
      const invoice = await service.issueInvoice('tenant-a', 'bk-1', 'u-staff');

      expect(repository.issueInvoice).toHaveBeenCalledWith(
        'tenant-a',
        'bk-1',
        'BR-2026-0042',
        'DZD',
        [
          { kind: 'DEPOSIT', description: 'Deposit on booking start', amountMinor: 10000 },
          { kind: 'RENTAL', description: 'Rental charges', amountMinor: 35000 },
        ],
        'u-staff',
      );
      expect(invoice.totalMinor).toBe(45000);
    });

    it('404s for an unknown booking', async () => {
      repository.findBookingFinanceContextForUser.mockResolvedValue(null);
      await expect(service.issueInvoice('tenant-a', 'bk-x', 'u-staff')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('404s when the booking lives in another tenant', async () => {
      repository.findBookingFinanceContextForUser.mockResolvedValue({
        ...customerContext,
        tenantId: 'tenant-b',
      });
      await expect(service.issueInvoice('tenant-a', 'bk-1', 'u-staff')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('409s for a draft booking (not eligible)', async () => {
      repository.findBookingFinanceContextForUser.mockResolvedValue(draftContext);
      await expect(service.issueInvoice('tenant-a', 'bk-1', 'u-staff')).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.issueInvoice).not.toHaveBeenCalled();
    });

    it('409s when the snapshot is missing', async () => {
      repository.findBookingFinanceContextForUser.mockResolvedValue(noSnapshotContext);
      await expect(service.issueInvoice('tenant-a', 'bk-1', 'u-staff')).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('voidInvoice', () => {
    it('returns the voided invoice', async () => {
      repository.voidInvoice.mockResolvedValue({
        outcome: 'VOIDED',
        invoice: invoiceRow({ status: 'VOIDED', voidedAt: new Date('2026-09-04T11:00:00Z') }),
      });
      const invoice = await service.voidInvoice('tenant-a', 'inv-1', 'u-staff');
      expect(invoice.status).toBe('VOIDED');
      expect(invoice.voidedAt).toBe('2026-09-04T11:00:00.000Z');
    });

    it('404s for an unknown invoice', async () => {
      repository.voidInvoice.mockResolvedValue({ outcome: 'NOT_FOUND' });
      await expect(service.voidInvoice('tenant-a', 'inv-x', 'u-staff')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('409s when the invoice is already voided', async () => {
      repository.voidInvoice.mockResolvedValue({ outcome: 'STATE' });
      await expect(service.voidInvoice('tenant-a', 'inv-1', 'u-staff')).rejects.toMatchObject({
        status: 409,
      });
    });
  });
});
