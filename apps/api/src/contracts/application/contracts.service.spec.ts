import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ContractsService } from './contracts.service';
import { ContractsRepository, type BookingContractContext } from '../infrastructure/contracts.repository';
import { TemplatesService } from '../../templates/application/templates.service';
import { ObjectStorage } from '../../media/ports/object-storage.port';
import { contentHashOf, ContractsErrorCode } from '../domain/contracts.rules';

/** PHASE-08 / 08-C service orchestration over mocked persistence/storage. */

function bookingContext(overrides: Partial<BookingContractContext> = {}): BookingContractContext {
  return {
    id: 'b1',
    tenant: { name: 'Location Oran' },
    bookingNumber: 'BN-2026-0042',
    status: 'CONFIRMED',
    currency: 'DZD',
    startsAt: new Date('2026-09-03T08:00:00Z'),
    endsAt: new Date('2026-09-05T08:00:00Z'),
    customerId: 'c1',
    assignedVehicleId: 'v1',
    pickupBranchId: 'br1',
    returnBranchId: 'br2',
    customer: {
      firstName: 'Amine',
      lastName: 'Benyoucef',
      preferredLocale: 'fr',
      licenseNumber: '11223344',
      licenseCountry: 'DZ',
      userId: 'u1',
    },
    assignedVehicle: { make: 'Mercedes', model: 'C220', year: 2024, plateNumber: '12345-16-12' },
    pickupBranch: { name: 'Oran Centre', contacts: { phone: '+213550000001' } },
    returnBranch: { name: 'Aéroport', contacts: { phone: '+213550000002' } },
    priceSnapshots: [{ pricingJson: { currency: 'DZD', totalMinor: 45000, depositMinor: 10000 } }],
    ...overrides,
  };
}

/** Extract the Nest error code carried in getResponse(). */
async function codeOf(this: void, promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const response = (error as HttpException).getResponse();
    return (response as { code?: string })?.code ?? '';
  }
  throw new Error('expected the promise to reject');
}

interface IssuedContractRow {
  id: string;
  tenantId: string;
  bookingId: string;
  contractNumber: string;
  status: 'ISSUED' | 'SIGNED' | 'CANCELLED';
  locale: string;
  issuedById: string | null;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  snapshot: {
    templateCode: string;
    templateVersion: number | null;
    locale: string;
    variablesJson: Prisma.JsonValue;
    contentText: string;
    contentHash: string;
    title: string;
    createdAt: Date;
  };
  signature: null;
  documents: Array<{ id: string; title: string; contentType: string; sizeBytes: number; createdAt: Date }>;
}

interface Mocks {
  findBookingContext: jest.Mock;
  findContractByBooking: jest.Mock;
  findContractByBookingId: jest.Mock;
  findContractById: jest.Mock;
  findContractForUser: jest.Mock;
  findReceiptByBooking: jest.Mock;
  findReceiptById: jest.Mock;
  findGeneratedDocument: jest.Mock;
  findVerifiedLicense: jest.Mock;
  createContract: jest.Mock;
  createSnapshot: jest.Mock;
  createSignature: jest.Mock;
  markContractStatus: jest.Mock;
  createReceipt: jest.Mock;
  createGeneratedDocument: jest.Mock;
  renderForTenant: jest.Mock;
  uploadDocument: jest.Mock;
  createSignedDownloadUrl: jest.Mock;
}

function buildMocks(): Mocks {
  return {
    findBookingContext: jest.fn(),
    findContractByBooking: jest.fn(),
    findContractByBookingId: jest.fn(),
    findContractById: jest.fn(),
    findContractForUser: jest.fn(),
    findReceiptByBooking: jest.fn(),
    findReceiptById: jest.fn(),
    findGeneratedDocument: jest.fn(),
    findVerifiedLicense: jest.fn(),
    createContract: jest.fn(),
    createSnapshot: jest.fn(),
    createSignature: jest.fn(),
    markContractStatus: jest.fn(),
    createReceipt: jest.fn(),
    createGeneratedDocument: jest.fn(),
    renderForTenant: jest.fn(),
    uploadDocument: jest.fn(),
    createSignedDownloadUrl: jest.fn(),
  };
}

function wireMocks(mocks: Mocks): {
  service: ContractsService;
  repository: ContractsRepository;
  templates: TemplatesService;
  storage: ObjectStorage;
  issue: (overrides?: Partial<BookingContractContext>) => IssuedContractRow;
} {
  const repository = {
    findBookingContext: mocks.findBookingContext,
    findContractByBooking: mocks.findContractByBooking,
    findContractByBookingId: mocks.findContractByBookingId,
    findContractById: mocks.findContractById,
    findContractForUser: mocks.findContractForUser,
    findReceiptByBooking: mocks.findReceiptByBooking,
    findReceiptById: mocks.findReceiptById,
    findGeneratedDocument: mocks.findGeneratedDocument,
    findVerifiedLicense: mocks.findVerifiedLicense,
    createContract: mocks.createContract,
    createSnapshot: mocks.createSnapshot,
    createSignature: mocks.createSignature,
    markContractStatus: mocks.markContractStatus,
    createReceipt: mocks.createReceipt,
    createGeneratedDocument: mocks.createGeneratedDocument,
  } as unknown as ContractsRepository;

  const templates = { renderForTenant: mocks.renderForTenant } as unknown as TemplatesService;
  const storage = {
    uploadDocument: mocks.uploadDocument,
    createSignedDownloadUrl: mocks.createSignedDownloadUrl,
  } as unknown as ObjectStorage;

  const service = new ContractsService(repository, templates, storage);

  let issuedId = 0;
  const issue = (overrides: Partial<BookingContractContext> = {}): IssuedContractRow => {
    const context = bookingContext(overrides);
    mocks.findBookingContext.mockResolvedValue(context);
    mocks.findContractByBooking.mockResolvedValue(null);
    mocks.findVerifiedLicense.mockResolvedValue({ number: '99887766' });
    mocks.renderForTenant.mockResolvedValue({
      locale: 'fr',
      fallback: false,
      version: 3,
      title: 'Contrat de location de véhicule',
      body: 'Contrat n° CT-BN-2026-0042 — Amine Benyoucef — 45 000 DZD',
      templateVersionId: 'tv3',
    });
    mocks.uploadDocument.mockResolvedValue({ objectKey: 'private/t/contracts/x.pdf' });
    issuedId += 1;
    const row: IssuedContractRow = {
      id: `ct${issuedId}`,
      tenantId: 't1',
      bookingId: context.id,
      contractNumber: 'CT-BN-2026-0042',
      status: 'ISSUED',
      locale: 'fr',
      issuedById: 'u-staff',
      issuedAt: new Date('2026-09-03T10:00:00Z'),
      createdAt: new Date('2026-09-03T10:00:00Z'),
      updatedAt: new Date('2026-09-03T10:00:00Z'),
      snapshot: {
        templateCode: 'RENTAL_CONTRACT',
        templateVersion: 3,
        locale: 'fr',
        variablesJson: { AGENCY_NAME: 'Location Oran' },
        contentText: 'Contrat n° CT-BN-2026-0042 — Amine Benyoucef — 45 000 DZD',
        contentHash: contentHashOf('Contrat n° CT-BN-2026-0042 — Amine Benyoucef — 45 000 DZD'),
        title: 'Contrat de location de véhicule',
        createdAt: new Date('2026-09-03T10:00:00Z'),
      },
      signature: null,
      documents: [
        {
          id: 'doc1',
          title: 'Contrat de location de véhicule',
          contentType: 'application/pdf',
          sizeBytes: 100,
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
      ],
    };
    mocks.createContract.mockResolvedValue(row);
    mocks.createSnapshot.mockResolvedValue(row.snapshot);
    mocks.createGeneratedDocument.mockResolvedValue(row.documents[0]);
    mocks.findContractById.mockResolvedValue(row);
    return row;
  };

  return { service, repository, templates, storage, issue };
}

describe('ContractsService (08-C)', () => {
  describe('issueContract', () => {
    it('renders the tenant template, stores the snapshot and uploads the PDF', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      const row = issue();
      const response = await service.issueContract('t1', 'b1', 'u-staff', {});

      expect(mocks.renderForTenant).toHaveBeenCalledWith(
        't1',
        'RENTAL_CONTRACT',
        expect.objectContaining({ locale: 'fr', values: expect.objectContaining({ RENTAL_AMOUNT: 45000 }) }),
      );
      expect(mocks.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          templateCode: 'RENTAL_CONTRACT',
          templateVersion: 3,
          contentHash: contentHashOf(row.snapshot.contentText),
          title: 'Contrat de location de véhicule',
        }),
      );
      const upload = (
        mocks.uploadDocument.mock.calls as unknown as Array<
          Array<{ kind: string; contentType: string; data: Buffer }>
        >
      )[0][0];
      expect(upload.kind).toBe('contract');
      expect(upload.contentType).toBe('application/pdf');
      expect(Buffer.from(upload.data).subarray(0, 5).toString()).toBe('%PDF-');
      expect(response.contractNumber).toBe('CT-BN-2026-0042');
      expect(response.status).toBe('ISSUED');
      expect(response.snapshot?.contentHash).toBe(contentHashOf(row.snapshot.contentText));
      expect(response.document).not.toBeNull();
    });

    it('defaults to Arabic when no locale is requested and the customer prefers unsupported', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue({ customer: { ...bookingContext().customer!, preferredLocale: 'de' } });
      await service.issueContract('t1', 'b1', 'u-staff', {});
      expect(mocks.renderForTenant).toHaveBeenCalledWith(
        't1',
        'RENTAL_CONTRACT',
        expect.objectContaining({ locale: 'ar' }),
      );
    });

    it('rejects an invalid locale', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      expect(await codeOf(service.issueContract('t1', 'b1', 'u-staff', { locale: 'de' }))).toBe(
        ContractsErrorCode.CONTRACT_LOCALE_INVALID,
      );
    });

    it('refuses bookings outside the issuable lifecycle', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findBookingContext.mockResolvedValue(bookingContext({ status: 'DRAFT' }));
      expect(await codeOf(service.issueContract('t1', 'b1', 'u-staff', {}))).toBe(
        ContractsErrorCode.CONTRACT_BOOKING_NOT_ISSUABLE,
      );
    });

    it('refuses a second contract for the same booking', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      mocks.findContractByBooking.mockResolvedValue({ id: 'ct1' });
      expect(await codeOf(service.issueContract('t1', 'b1', 'u-staff', {}))).toBe(
        ContractsErrorCode.CONTRACT_EXISTS,
      );
    });

    it('reports missing booking data with the variable list', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findBookingContext.mockResolvedValue(
        bookingContext({ customer: null, pickupBranch: null, returnBranch: null, priceSnapshots: [] }),
      );
      expect(await codeOf(service.issueContract('t1', 'b1', 'u-staff', {}))).toBe(
        ContractsErrorCode.CONTRACT_AGENCY_CONTACT_MISSING,
      );
    });

    it('propagates the template render error for unknown bookings', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findBookingContext.mockResolvedValue(null);
      await expect(service.issueContract('t1', 'missing', 'u-staff', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('signContract', () => {
    it('records the signature with actor/time evidence and regenerates the signed PDF', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      await service.issueContract('t1', 'b1', 'u-staff', {});
      mocks.createSignature.mockResolvedValue({
        id: 'sig1',
        method: 'ON_SITE',
        signerRole: 'AGENCY_REPRESENTATIVE',
        signerName: 'Brahim',
        note: null,
        signedAt: new Date('2026-09-03T11:00:00Z'),
        templateVersion: 3,
        contentHash: contentHashOf('x'),
      });

      await service.signContract('t1', 'ct1', 'u-staff', {
        method: 'ON_SITE',
        signerRole: 'AGENCY_REPRESENTATIVE',
        signerName: 'Brahim',
      });

      expect(mocks.createSignature).toHaveBeenCalledWith(
        expect.objectContaining({ signerName: 'Brahim', signedByUserId: 'u-staff' }),
      );
      expect(mocks.markContractStatus).toHaveBeenCalledWith('t1', 'ct1', 'SIGNED');
      expect(mocks.uploadDocument.mock.calls.length).toBe(2); // issued + signed
    });

    it('rejects an already-signed contract', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      mocks.findContractById.mockResolvedValue({
        ...issue(),
        signature: { id: 'sig1' },
      });
      expect(
        await codeOf(
          service.signContract('t1', 'ct1', 'u-staff', {
            method: 'ON_SITE',
            signerRole: 'AGENCY_REPRESENTATIVE',
            signerName: 'Brahim',
          }),
        ),
      ).toBe(ContractsErrorCode.SIGNATURE_EXISTS);
    });

    it('validates the signature input', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      expect(
        await codeOf(
          service.signContract('t1', 'ct1', 'u-staff', {
            method: 'FAX' as never,
            signerRole: 'CUSTOMER',
            signerName: 'x',
          }),
        ),
      ).toBe(ContractsErrorCode.SIGNATURE_INPUT_INVALID);
      expect(
        await codeOf(
          service.signContract('t1', 'ct1', 'u-staff', {
            method: 'ON_SITE',
            signerRole: 'AGENCY_REPRESENTATIVE',
            signerName: '',
          }),
        ),
      ).toBe(ContractsErrorCode.SIGNATURE_INPUT_INVALID);
    });

    it('forbids a non-customer from signing as CUSTOMER', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      await expect(
        service.signContract('t1', 'ct1', 'u-other', {
          method: 'CUSTOMER_DIGITAL',
          signerRole: 'CUSTOMER',
          signerName: 'Amine',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the booking customer to sign as CUSTOMER', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      mocks.createSignature.mockResolvedValue({
        id: 'sig1',
        method: 'CUSTOMER_DIGITAL',
        signerRole: 'CUSTOMER',
        signerName: 'Amine',
        note: null,
        signedByUserId: 'u1',
        signedAt: new Date('2026-09-03T11:00:00Z'),
        templateVersion: 3,
        contentHash: contentHashOf('x'),
      });
      await service.signContract('t1', 'ct1', 'u1', {
        method: 'CUSTOMER_DIGITAL',
        signerRole: 'CUSTOMER',
        signerName: 'Amine',
      });
      expect(mocks.createSignature).toHaveBeenCalledWith(
        expect.objectContaining({ signerRole: 'CUSTOMER', signedByUserId: 'u1' }),
      );
    });
  });

  describe('receipts', () => {
    it('generates a receipt tracing the price snapshot and uploads the PDF', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      mocks.findContractByBookingId.mockResolvedValue({
        id: 'ct1',
        tenantId: 't1',
        bookingId: 'b1',
        contractNumber: 'CT-BN-2026-0042',
        locale: 'fr',
        issuedAt: new Date('2026-09-03T10:00:00Z'),
      });
      mocks.findReceiptByBooking.mockResolvedValue(null);
      const receiptRow = {
        id: 'r1',
        bookingId: 'b1',
        contractId: 'ct1',
        receiptNumber: 'RT-BN-2026-0042',
        kind: 'RENTAL_CONTRACT',
        locale: 'fr',
        totalsJson: { currency: 'DZD', totalMinor: 45000, depositMinor: 10000 },
        contentHash: contentHashOf('receipt'),
        contentText: 'receipt',
        createdAt: new Date('2026-09-03T12:00:00Z'),
        documents: [],
      };
      mocks.createReceipt.mockResolvedValue(receiptRow);
      mocks.findReceiptById.mockResolvedValue(receiptRow);

      const response = await service.generateReceipt('t1', 'b1', 'u-staff');

      expect(mocks.createReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          receiptNumber: 'RT-BN-2026-0042',
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      );
      const upload = (
        mocks.uploadDocument.mock.calls as unknown as Array<
          Array<{ kind: string; contentType: string; data: Buffer }>
        >
      )[0][0];
      expect(upload.kind).toBe('receipt');
      expect(response.totals).toEqual({ currency: 'DZD', totalMinor: 45000, depositMinor: 10000 });
    });

    it('requires a contract before a receipt', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      mocks.findContractByBookingId.mockResolvedValue(null);
      expect(await codeOf(service.generateReceipt('t1', 'b1', 'u-staff'))).toBe(
        ContractsErrorCode.RECEIPT_CONTRACT_MISSING,
      );
    });

    it('refuses duplicate receipts', async () => {
      const mocks = buildMocks();
      const { service, issue } = wireMocks(mocks);
      issue();
      mocks.findContractByBookingId.mockResolvedValue({ id: 'ct1' });
      mocks.findReceiptByBooking.mockResolvedValue({ id: 'r1' });
      expect(await codeOf(service.generateReceipt('t1', 'b1', 'u-staff'))).toBe(
        ContractsErrorCode.RECEIPT_EXISTS,
      );
    });

    it('404s for unknown receipts', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findReceiptById.mockResolvedValue(null);
      await expect(service.getReceipt('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('downloads', () => {
    it('returns a short-lived signed URL for a generated document', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findGeneratedDocument.mockResolvedValue({
        id: 'doc1',
        objectKey: 'private/t/contracts/x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048,
        title: 'Contrat',
      });
      mocks.createSignedDownloadUrl.mockResolvedValue('https://r2.test/signed');

      const response = await service.downloadDocument('t1', 'doc1');

      expect(mocks.createSignedDownloadUrl).toHaveBeenCalledWith(
        'private/t/contracts/x.pdf',
        expect.any(Number),
      );
      expect(response.url).toBe('https://r2.test/signed');
      expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('404s for unknown documents', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findGeneratedDocument.mockResolvedValue(null);
      await expect(service.downloadDocument('t1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('portal reads', () => {
    it('serves own contracts only', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findContractForUser.mockResolvedValue(null);
      await expect(service.getContractForUser('u-other', 'ct1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
