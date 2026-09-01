import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Customer, CustomerDocument, Vehicle } from '@prisma/client';
import { CustomerSelfService } from './customer-self.service';
import type { CustomerSelfRepository } from '../infrastructure/customer-self.repository';
import type { VehicleRepository } from '../../fleet/infrastructure/vehicle.repository';

type FakeSelfRepository = {
  [K in keyof CustomerSelfRepository]: jest.Mock;
};

function makeRepository(overrides: Partial<FakeSelfRepository> = {}): FakeSelfRepository {
  return {
    listOwnCustomers: jest.fn(),
    findOwnCustomer: jest.fn(),
    updateOwnCustomer: jest.fn(),
    listDocuments: jest.fn(),
    findDocument: jest.fn(),
    createDocument: jest.fn(),
    updateDocument: jest.fn(),
    listFavorites: jest.fn(),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
    recordView: jest.fn(),
    pruneRecentlyViewed: jest.fn(),
    listRecentlyViewed: jest.fn(),
    clearRecentlyViewed: jest.fn(),
    addSearchHistory: jest.fn(),
    listSearchHistory: jest.fn(),
    clearSearchHistory: jest.fn(),
    ...overrides,
  };
}

const customerRow = (overrides: Partial<Customer> = {}): Customer =>
  ({
    id: 'customer-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    firstName: 'Amina',
    lastName: 'Bouzid',
    phone: null,
    email: null,
    preferredLocale: 'en',
    dateOfBirth: null,
    licenseNumber: null,
    licenseCountry: null,
    licenseIssueDate: null,
    licenseExpiryDate: null,
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
    number: null,
    issueDate: null,
    expiryDate: null,
    status: 'PENDING',
    mediaObjectId: null,
    verifiedAt: null,
    verifiedBy: null,
    rejectionReason: null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    ...overrides,
  });

const vehicleRow = (overrides: Partial<Vehicle> = {}): Vehicle =>
  ({
    id: 'vehicle-1',
    tenantId: 'tenant-2',
    categoryId: 'category-1',
    currentBranchId: null,
    make: 'Dacia',
    model: 'Logan',
    year: 2024,
    plateNumber: 'P123',
    vin: null,
    color: 'White',
    status: 'AVAILABLE',
    acquisitionDate: null,
    acquisitionCost: null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
    updatedAt: new Date('2026-09-01T08:00:00.000Z'),
    ...overrides,
  });

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  });

function makeService(
  repo: FakeSelfRepository,
  vehicleRepo: Partial<Record<keyof VehicleRepository, jest.Mock>> = {},
): CustomerSelfService {
  return new CustomerSelfService(
    repo as unknown as CustomerSelfRepository,
    { findById: jest.fn(), ...vehicleRepo } as unknown as VehicleRepository,
  );
}

describe('CustomerSelfService (07-A self-service)', () => {
  describe('own profiles (07-A02/07-A03)', () => {
    it('lists only records linked to the caller', async () => {
      const repo = makeRepository();
      repo.listOwnCustomers.mockResolvedValue([
        { ...customerRow(), tenant: { id: 'tenant-1', name: 'Agence Oran', slug: 'agence-oran' } },
      ]);
      const service = makeService(repo);
      const profiles = await service.listMyProfiles('user-1');
      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toMatchObject({
        id: 'customer-1',
        agency: { id: 'tenant-1', slug: 'agence-oran' },
      });
    });

    it('returns 404 for records not linked to the caller', async () => {
      const repo = makeRepository();
      repo.findOwnCustomer.mockResolvedValue(undefined);
      const service = makeService(repo);
      const failure = await service
        .getMyProfile('user-2', 'customer-1')
        .then(() => null)
        .catch((error: NotFoundException) => error);
      expect((failure as NotFoundException).getResponse()).toMatchObject({
        code: 'CUSTOMER_NOT_FOUND',
      });
    });

    it('updates profile settings but never the caller-supplied status', async () => {
      const repo = makeRepository();
      repo.findOwnCustomer.mockResolvedValue(customerRow());
      repo.updateOwnCustomer.mockResolvedValue(customerRow({ preferredLocale: 'fr' }));
      const service = makeService(repo);
      const response = await service.updateMyProfile('user-1', 'customer-1', {
        preferredLocale: 'fr',
      });
      expect(response.preferredLocale).toBe('fr');

      const statusAttempt = await service
        .updateMyProfile('user-1', 'customer-1', { status: 'ARCHIVED' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((statusAttempt as ConflictException).getResponse()).toMatchObject({
        code: 'CUSTOMER_STATUS_INVALID',
      });
    });
  });

  describe('own documents (07-A04)', () => {
    it('adds a pending document for the linked record', async () => {
      const repo = makeRepository();
      repo.findOwnCustomer.mockResolvedValue(customerRow());
      repo.listDocuments.mockResolvedValue([]);
      repo.createDocument.mockResolvedValue(documentRow({ type: 'PASSPORT' }));
      const service = makeService(repo);
      const response = await service.addMyDocument('user-1', 'customer-1', { type: 'PASSPORT' });
      expect(response.type).toBe('PASSPORT');
      expect(repo.createDocument).toHaveBeenCalledWith({
        customerId: 'customer-1',
        type: 'PASSPORT',
        number: null,
        issueDate: null,
        expiryDate: null,
      });
    });

    it('refuses verified documents to be changed by the customer', async () => {
      const repo = makeRepository();
      repo.findOwnCustomer.mockResolvedValue(customerRow());
      repo.findDocument.mockResolvedValue(documentRow({ status: 'VERIFIED' }));
      const service = makeService(repo);
      const failure = await service
        .updateMyDocument('user-1', 'customer-1', 'doc-1', { number: '999' })
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'DOCUMENT_VERIFIED_IMMUTABLE',
      });
    });

    it('resubmits a rejected document as PENDING', async () => {
      const repo = makeRepository();
      repo.findOwnCustomer.mockResolvedValue(customerRow());
      repo.findDocument.mockResolvedValue(documentRow({ status: 'REJECTED' }));
      repo.updateDocument.mockResolvedValue(documentRow({ status: 'PENDING' }));
      const service = makeService(repo);
      const response = await service.updateMyDocument('user-1', 'customer-1', 'doc-1', {
        number: '999',
      });
      expect(response.status).toBe('PENDING');
      expect(repo.updateDocument).toHaveBeenCalledWith('customer-1', 'doc-1', {
        number: '999',
        status: 'PENDING',
      });
    });
  });

  describe('favorites (07-A05)', () => {
    it('adds a favorite after checking the vehicle exists', async () => {
      const repo = makeRepository();
      const vehicles = { findById: jest.fn() };
      vehicles.findById.mockResolvedValue(vehicleRow());
      repo.addFavorite.mockResolvedValue({ vehicleId: 'vehicle-1', createdAt: new Date() });
      const service = makeService(repo, vehicles);
      const item = await service.addFavorite('user-1', 'vehicle-1');
      expect(item.vehicleId).toBe('vehicle-1');
      expect(item.vehicle).toMatchObject({ make: 'Dacia', model: 'Logan', tenantId: 'tenant-2' });
    });

    it('rejects unknown vehicles', async () => {
      const repo = makeRepository();
      const vehicles = { findById: jest.fn() };
      vehicles.findById.mockResolvedValue(undefined);
      const service = makeService(repo, vehicles);
      const failure = await service
        .addFavorite('user-1', 'ghost')
        .then(() => null)
        .catch((error: NotFoundException) => error);
      expect((failure as NotFoundException).getResponse()).toMatchObject({
        code: 'VEHICLE_NOT_FOUND',
      });
    });

    it('maps duplicate favorites to FAVORITE_EXISTS', async () => {
      const repo = makeRepository();
      const vehicles = { findById: jest.fn() };
      vehicles.findById.mockResolvedValue(vehicleRow());
      repo.addFavorite.mockRejectedValue(p2002());
      const service = makeService(repo, vehicles);
      const failure = await service
        .addFavorite('user-1', 'vehicle-1')
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((failure as ConflictException).getResponse()).toMatchObject({
        code: 'FAVORITE_EXISTS',
      });
    });

    it('removes favorites and rejects unknown ones', async () => {
      const repo = makeRepository();
      repo.removeFavorite.mockResolvedValue(true);
      const service = makeService(repo);
      await expect(service.removeFavorite('user-1', 'vehicle-1')).resolves.toEqual({
        removed: true,
      });

      repo.removeFavorite.mockResolvedValue(false);
      const failure = await service
        .removeFavorite('user-1', 'vehicle-1')
        .then(() => null)
        .catch((error: NotFoundException) => error);
      expect((failure as NotFoundException).getResponse()).toMatchObject({
        code: 'FAVORITE_NOT_FOUND',
      });
    });
  });

  describe('recently viewed (07-A06) and search history (07-A07)', () => {
    it('records a view only for existing vehicles', async () => {
      const repo = makeRepository();
      const vehicles = { findById: jest.fn() };
      vehicles.findById.mockResolvedValue(vehicleRow());
      const service = makeService(repo, vehicles);
      await expect(service.recordView('user-1', { vehicleId: 'vehicle-1' })).resolves.toEqual({
        recorded: true,
      });
      expect(repo.recordView).toHaveBeenCalledWith('user-1', 'vehicle-1', expect.any(Date) as Date);

      const missing = await service
        .recordView('user-1', {})
        .then(() => null)
        .catch((error: ConflictException) => error);
      expect((missing as ConflictException).getResponse()).toMatchObject({
        code: 'VEHICLE_NOT_FOUND',
      });
    });

    it('validates search criteria as a non-empty JSON object', async () => {
      const repo = makeRepository();
      repo.addSearchHistory.mockResolvedValue(undefined);
      repo.listSearchHistory.mockResolvedValue([
        { id: 'h-1', criteria: { pickup: 'Oran' }, createdAt: new Date('2026-09-01T08:00:00.000Z') },
      ]);
      const service = makeService(repo);

      for (const bad of [null, undefined, 'query', [], 42]) {
        const failure = await service
          .recordSearch('user-1', { criteria: bad })
          .then(() => null)
          .catch((error: ConflictException) => error);
        expect((failure as ConflictException).getResponse()).toMatchObject({
          code: 'SEARCH_CRITERIA_INVALID',
        });
      }

      const response = await service.recordSearch('user-1', {
        criteria: { pickup: 'Oran', dates: { start: '2026-09-10', end: '2026-09-12' } },
      });
      expect(response.id).toBe('h-1');
      const stored = repo.addSearchHistory.mock.calls[0] as [string, Record<string, unknown>];
      expect(stored[0]).toBe('user-1');
      expect(stored[1]).toEqual({
        pickup: 'Oran',
        dates: { start: '2026-09-10', end: '2026-09-12' },
      });
    });

    it('clears recently viewed and search history', async () => {
      const repo = makeRepository();
      const service = makeService(repo);
      await expect(service.clearRecentlyViewed('user-1')).resolves.toEqual({ cleared: true });
      await expect(service.clearSearchHistory('user-1')).resolves.toEqual({ cleared: true });
      expect(repo.clearRecentlyViewed).toHaveBeenCalledWith('user-1');
      expect(repo.clearSearchHistory).toHaveBeenCalledWith('user-1');
    });
  });
});
