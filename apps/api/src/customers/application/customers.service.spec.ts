import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Customer, CustomerDocument } from '@prisma/client';
import { CustomersService } from './customers.service';
import type { CustomersRepository } from '../infrastructure/customers.repository';

type FakeRepository = {
  [K in keyof CustomersRepository]: jest.Mock;
};

function makeRepository(overrides: Partial<FakeRepository> = {}): FakeRepository {
  return {
    createCustomer: jest.fn(),
    findCustomerInTenant: jest.fn(),
    findCustomerByUserId: jest.fn(),
    listCustomers: jest.fn(),
    updateCustomer: jest.fn(),
    linkCustomer: jest.fn(),
    unlinkCustomer: jest.fn(),
    findUserByEmail: jest.fn(),
    listDocumentsForCustomer: jest.fn(),
    findDocument: jest.fn(),
    createDocument: jest.fn(),
    updateDocument: jest.fn(),
    ...overrides,
  };
}

const customerRow = (overrides: Partial<Customer> = {}): Customer =>
  ({
    id: 'customer-1',
    tenantId: 'tenant-1',
    userId: null,
    firstName: 'Amina',
    lastName: 'Bouzid',
    phone: '+213 555 12 34 56',
    email: 'amina@example.com',
    preferredLocale: 'en',
    dateOfBirth: new Date('1990-05-12'),
    licenseNumber: '123456789',
    licenseCountry: 'DZ',
    licenseIssueDate: new Date('2020-01-10'),
    licenseExpiryDate: new Date('2030-01-10'),
    status: 'ACTIVE',
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    ...overrides,
  });

const documentRow = (overrides: Partial<CustomerDocument> = {}): CustomerDocument =>
  ({
    id: 'doc-1',
    customerId: 'customer-1',
    type: 'DRIVER_LICENSE',
    number: '987654321',
    issueDate: new Date('2018-02-01'),
    expiryDate: new Date('2028-02-01'),
    status: 'PENDING',
    mediaObjectId: null,
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    ...overrides,
  });

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('CustomersService (07-A agency-side)', () => {
  describe('createCustomer', () => {
    it('creates with parsed values and jurisdiction defaults', async () => {
      const repo = makeRepository();
      let createdArg: Record<string, unknown> = {};
      repo.createCustomer.mockImplementation((data: Record<string, unknown>) => {
        createdArg = data;
        return Promise.resolve(customerRow({ licenseCountry: 'DZ', phone: null }));
      });
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const response = await service.createCustomer('tenant-1', {
        firstName: ' Amina ',
        lastName: 'Bouzid',
        phone: '',
        email: 'AMINA@EXAMPLE.COM',
        licenseNumber: '123456789',
      });
      expect(response).toMatchObject({ id: 'customer-1', status: 'ACTIVE' });
      expect(response.dateOfBirth).toBe('1990-05-12');
      expect(response.createdAt).toBe('2026-09-01T08:00:00.000Z');
      expect(createdArg).toMatchObject({
        tenantId: 'tenant-1',
        userId: null,
        firstName: 'Amina',
        email: 'amina@example.com',
        preferredLocale: 'en',
        licenseCountry: 'DZ',
      });
    });

    it('rejects when a required name is missing', async () => {
      const repo = makeRepository();
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .createCustomer('tenant-1', { firstName: 'Amina' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect(failure).toBeInstanceOf(ConflictException);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_NAME_INVALID',
      });
    });

    it('rejects invalid field values with stable codes', async () => {
      const repo = makeRepository();
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .createCustomer('tenant-1', { firstName: 'A', lastName: 'B', email: 'nope' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_EMAIL_INVALID',
      });
    });

    it('rejects unordered license dates', async () => {
      const repo = makeRepository();
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .createCustomer('tenant-1', {
          firstName: 'A',
          lastName: 'B',
          licenseIssueDate: '2032-01-01',
          licenseExpiryDate: '2030-01-01',
        })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_LICENSE_INVALID',
      });
    });
  });

  describe('listCustomers', () => {
    it('parses limit/offset and passes the filter through', async () => {
      const repo = makeRepository();
      repo.listCustomers.mockResolvedValue({ rows: [customerRow()], total: 1 });
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const result = await service.listCustomers('tenant-1', {
        search: 'amina',
        status: 'ACTIVE',
        limit: '10',
        offset: '5',
      });
      expect(result).toMatchObject({ total: 1, limit: 10, offset: 5 });
      expect(result.items[0].id).toBe('customer-1');
      expect(repo.listCustomers).toHaveBeenCalledWith('tenant-1', {
        search: 'amina',
        status: 'ACTIVE',
        limit: 10,
        offset: 5,
      });
    });

    it('rejects out-of-range limits', async () => {
      const repo = makeRepository();
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .listCustomers('tenant-1', { limit: '101' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_LIST_QUERY_INVALID',
      });
    });
  });

  describe('getCustomerDetail', () => {
    it('returns 404 for a customer outside the tenant', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(undefined);
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .getCustomerDetail('tenant-2', 'customer-1')
        .then(() => null)
        .catch((error: NotFoundException) => error);
      expect((failure as NotFoundException).getResponse()).toMatchObject({
        code: 'CUSTOMER_NOT_FOUND',
      });
    });

    it('returns documents and the computed requirements state', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.listDocumentsForCustomer.mockResolvedValue([
        documentRow({ type: 'DRIVER_LICENSE', status: 'VERIFIED', expiryDate: new Date('2030-01-01') }),
      ]);
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const detail = await service.getCustomerDetail('tenant-1', 'customer-1');
      expect(detail.documentRequirements).toEqual({
        requiredTypes: ['DRIVER_LICENSE'],
        satisfied: true,
        unmet: [],
      });
      expect(detail.documents[0]).toMatchObject({ type: 'DRIVER_LICENSE', expired: false });
    });

    it('flags expired documents and unmet requirements', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.listDocumentsForCustomer.mockResolvedValue([
        documentRow({ status: 'VERIFIED', expiryDate: new Date('2020-01-01') }),
      ]);
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const detail = await service.getCustomerDetail('tenant-1', 'customer-1');
      expect(detail.documents[0].expired).toBe(true);
      expect(detail.documentRequirements.satisfied).toBe(false);
      expect(detail.documentRequirements.unmet[0]).toEqual({
        type: 'DRIVER_LICENSE',
        reason: 'EXPIRED',
      });
    });
  });

  describe('updateCustomer', () => {
    it('applies a parsed patch and preserves untouched fields', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.updateCustomer.mockResolvedValue(customerRow({ phone: '+213 661 00 00 00' }));
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const response = await service.updateCustomer('tenant-1', 'customer-1', { phone: '+213 661 00 00 00' });
      expect(response.phone).toBe('+213 661 00 00 00');
      expect(repo.updateCustomer).toHaveBeenCalledWith('tenant-1', 'customer-1', {
        phone: '+213 661 00 00 00',
      });
    });

    it('defaults a new license country to DZ when none is stored', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow({ licenseNumber: null, licenseCountry: null }));
      repo.updateCustomer.mockImplementation(
        (_tenantId: string, _id: string, patch: Record<string, unknown>) =>
          customerRow({ licenseNumber: patch.licenseNumber as string, licenseCountry: patch.licenseCountry as string }),
      );
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const response = await service.updateCustomer('tenant-1', 'customer-1', { licenseNumber: 'ABC-123' });
      expect(response.licenseCountry).toBe('DZ');
    });

    it('rejects unordered license dates against stored values', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(
        customerRow({
          licenseIssueDate: new Date('2020-01-01'),
          licenseExpiryDate: new Date('2030-01-01'),
        }),
      );
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .updateCustomer('tenant-1', 'customer-1', { licenseIssueDate: '2035-01-01' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_LICENSE_INVALID',
      });
    });
  });

  describe('account linkage (07-A02)', () => {
    it('rejects linking an already-linked record', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow({ userId: 'user-1' }));
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .linkCustomer('tenant-1', 'customer-1', { email: 'x@example.com' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_ALREADY_LINKED',
      });
    });

    it('requires an email and an existing ACTIVE user', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      const service = new CustomersService(repo as unknown as CustomersRepository);

      const missingEmail = await service
        .linkCustomer('tenant-1', 'customer-1', {})
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((missingEmail as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_EMAIL_INVALID',
      });

      repo.findUserByEmail.mockResolvedValue(undefined);
      const unknown = await service
        .linkCustomer('tenant-1', 'customer-1', { email: 'ghost@example.com' })
        .then(() => null)
        .catch((error: NotFoundException) => error);
      expect((unknown as NotFoundException).getResponse()).toMatchObject({ code: 'USER_NOT_FOUND' });

      repo.findUserByEmail.mockResolvedValue({ id: 'user-1', status: 'SUSPENDED' });
      const disabled = await service
        .linkCustomer('tenant-1', 'customer-1', { email: 'sus@example.com' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((disabled as ConflictException).getResponse()).toMatchObject({
        code: 'USER_LINK_DISABLED',
      });
    });

    it('links a matching ACTIVE platform account', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.findUserByEmail.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });
      repo.linkCustomer.mockResolvedValue(customerRow({ userId: 'user-1' }));
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const response = await service.linkCustomer('tenant-1', 'customer-1', {
        email: 'amina@example.com',
      });
      expect(response.userId).toBe('user-1');
      expect(repo.linkCustomer).toHaveBeenCalledWith('tenant-1', 'customer-1', 'user-1');
    });

    it('maps the unique-link violation to CUSTOMER_LINK_TAKEN', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.findUserByEmail.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });
      repo.linkCustomer.mockRejectedValue(p2002());
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .linkCustomer('tenant-1', 'customer-1', { email: 'amina@example.com' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_LINK_TAKEN',
      });
    });

    it('rejects unlinking an unlinked record', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .unlinkCustomer('tenant-1', 'customer-1')
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_NOT_LINKED',
      });
    });

    it('unlinks a linked record', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow({ userId: 'user-1' }));
      repo.unlinkCustomer.mockResolvedValue(customerRow());
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const response = await service.unlinkCustomer('tenant-1', 'customer-1');
      expect(response.userId).toBeNull();
    });
  });

  describe('documents (07-A04)', () => {
    it('rejects creating a second document of the same type', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.listDocumentsForCustomer.mockResolvedValue([documentRow()]);
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const failure = await service
        .createDocument('tenant-1', 'customer-1', { type: 'DRIVER_LICENSE' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_TYPE_EXISTS',
      });
    });

    it('creates a document and requires a type', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.listDocumentsForCustomer.mockResolvedValue([]);
      repo.createDocument.mockResolvedValue(documentRow({ type: 'PASSPORT', number: null }));
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const response = await service.createDocument('tenant-1', 'customer-1', { type: 'PASSPORT' });
      expect(response.type).toBe('PASSPORT');

      const missingType = await service
        .createDocument('tenant-1', 'customer-1', {})
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((missingType as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_TYPE_INVALID',
      });
    });

    it('resets verification to PENDING when metadata changes', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.findDocument.mockResolvedValue(documentRow({ status: 'VERIFIED', verifiedAt: new Date() }));
      repo.updateDocument.mockResolvedValue(documentRow({ status: 'PENDING', verifiedAt: null }));
      const service = new CustomersService(repo as unknown as CustomersRepository);
      const response = await service.updateDocument('tenant-1', 'customer-1', 'doc-1', {
        number: '111222333',
      });
      expect(response.status).toBe('PENDING');
      expect(repo.updateDocument).toHaveBeenCalledWith('customer-1', 'doc-1', {
        number: '111222333',
        status: 'PENDING',
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
      });
    });

    it('verifies only PENDING documents with a valid decision', async () => {
      const repo = makeRepository();
      repo.findCustomerInTenant.mockResolvedValue(customerRow());
      repo.findDocument.mockResolvedValue(documentRow());
      repo.updateDocument.mockResolvedValue(documentRow({ status: 'VERIFIED', verifiedAt: new Date() }));
      const service = new CustomersService(repo as unknown as CustomersRepository);

      const badDecision = await service
        .verifyDocument('tenant-1', 'customer-1', 'doc-1', 'actor-1', { decision: 'MAYBE' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((badDecision as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_STATUS_TRANSITION_INVALID',
      });

      repo.findDocument.mockResolvedValue(documentRow({ status: 'VERIFIED' }));
      const wrongState = await service
        .verifyDocument('tenant-1', 'customer-1', 'doc-1', 'actor-1', { decision: 'VERIFIED' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((wrongState as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_STATUS_TRANSITION_INVALID',
      });

      repo.findDocument.mockResolvedValue(documentRow());
      const missingReason = await service
        .verifyDocument('tenant-1', 'customer-1', 'doc-1', 'actor-1', { decision: 'REJECTED' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((missingReason as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_REJECTION_REASON_REQUIRED',
      });

      const captured: Array<{
        status: string;
        verifiedAt: Date | null;
        verifiedBy: string | null;
        rejectionReason: string | null;
      } | null> = [null];
      repo.updateDocument.mockImplementation(
        (_customerId: string, _documentId: string, patch: (typeof captured)[0]) => {
          captured[0] = patch;
          return Promise.resolve(documentRow({ status: 'VERIFIED', verifiedAt: new Date() }));
        },
      );
      const verified = await service.verifyDocument('tenant-1', 'customer-1', 'doc-1', 'actor-1', {
        decision: 'VERIFIED',
      });
      expect(verified.status).toBe('VERIFIED');
      expect(captured[0]?.status).toBe('VERIFIED');
      expect(captured[0]?.verifiedAt).toBeInstanceOf(Date);
      expect(captured[0]?.verifiedBy).toBe('actor-1');
      expect(captured[0]?.rejectionReason).toBeNull();
    });
  });
});
