import { ConflictException, NotFoundException } from '@nestjs/common';
import type { CustomerDocument } from '@prisma/client';
import { DocumentsService } from './documents.service';
import type { DocumentsRepository } from '../infrastructure/documents.repository';

const TENANT = '11111111-1111-4111-8111-111111111111';
const BOOKING = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';

const now = new Date('2026-09-02T12:00:00Z');

function makeRepository(overrides: Partial<DocumentsRepository> = {}) {
  const repository = {
    findPolicy: jest.fn(),
    upsertPolicy: jest.fn(),
    findCustomer: jest.fn(),
    listCustomerDocuments: jest.fn(),
    findBookingContext: jest.fn(),
    ...overrides,
  };
  return repository;
}

const licenseDocument = (status: CustomerDocument['status'], expiryDate: Date | null) =>
  ({ type: 'DRIVER_LICENSE', status, expiryDate }) as CustomerDocument;

describe('DocumentsService.getPolicy (08-A02)', () => {
  it('returns the documented default, unconfigured, when no row exists', async () => {
    const repository = makeRepository({ findPolicy: jest.fn().mockResolvedValue(null) });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    await expect(service.getPolicy(TENANT)).resolves.toEqual({
      requiredTypes: [],
      requirePassportForForeignLicense: false,
      configured: false,
    });
  });

  it('returns the configured policy with configured:true', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue({
        tenantId: TENANT,
        requiredTypes: ['NATIONAL_ID'],
        requirePassportForForeignLicense: true,
      }),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    await expect(service.getPolicy(TENANT)).resolves.toEqual({
      requiredTypes: ['NATIONAL_ID'],
      requirePassportForForeignLicense: true,
      configured: true,
    });
  });
});

describe('DocumentsService.upsertPolicy (08-A02)', () => {
  it('persists validated, deduplicated types and a strict boolean', async () => {
    const upsertPolicy = jest.fn().mockResolvedValue({});
    const repository = makeRepository({ upsertPolicy });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const result = await service.upsertPolicy(TENANT, {
      requiredTypes: ['PASSPORT', 'PASSPORT', 'NATIONAL_ID'],
      requirePassportForForeignLicense: true,
    });
    expect(upsertPolicy).toHaveBeenCalledWith(TENANT, {
      requiredTypes: ['PASSPORT', 'NATIONAL_ID'],
      requirePassportForForeignLicense: true,
    });
    expect(result.configured).toBe(true);
  });

  it('rejects unknown document types with INVALID_DOCUMENT_TYPES', async () => {
    const repository = makeRepository();
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const failure = await service
      .upsertPolicy(TENANT, { requiredTypes: ['FAKE_TYPE'], requirePassportForForeignLicense: false })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'INVALID_DOCUMENT_TYPES',
    });
  });

  it('rejects non-array requiredTypes', async () => {
    const repository = makeRepository();
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const failure = await service
      .upsertPolicy(TENANT, { requiredTypes: 'PASSPORT' })
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'INVALID_DOCUMENT_TYPES',
    });
  });

  it('defaults to an empty policy for a partial input', async () => {
    const upsertPolicy = jest.fn().mockResolvedValue({});
    const repository = makeRepository({ upsertPolicy });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const result = await service.upsertPolicy(TENANT, {});
    expect(upsertPolicy).toHaveBeenCalledWith(TENANT, { requiredTypes: [], requirePassportForForeignLicense: false });
    expect(result.configured).toBe(true);
  });
});

describe('DocumentsService.checklistForBooking (08-A04/08-A05)', () => {
  it('404s for an unknown booking in this agency', async () => {
    const repository = makeRepository({ findBookingContext: jest.fn().mockResolvedValue(null) });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const failure = await service
      .checklistForBooking(TENANT, BOOKING, now)
      .then(() => null)
      .catch((error: NotFoundException) => error);
    expect((failure as NotFoundException).getResponse()).toMatchObject({ code: 'BOOKING_NOT_FOUND' });
  });

  it('reports a walk-in booking as unlinked with every required type NOT_SUBMITTED', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue(null),
      findBookingContext: jest.fn().mockResolvedValue({
        id: BOOKING,
        customerId: null,
        startsAt: new Date('2026-09-03T12:00:00Z'),
        endsAt: new Date('2026-09-10T12:00:00Z'),
      }),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const checklist = await service.checklistForBooking(TENANT, BOOKING, now);
    expect(checklist.customerLinked).toBe(false);
    expect(checklist.required).toEqual(['DRIVER_LICENSE']);
    expect(checklist.items).toEqual([{ type: 'DRIVER_LICENSE', status: 'NOT_SUBMITTED', expiresAt: null }]);
    expect(checklist.complete).toBe(false);
  });

  it('404s when the linked customer is missing', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue(null),
      findBookingContext: jest.fn().mockResolvedValue({
        id: BOOKING,
        customerId: CUSTOMER,
        startsAt: new Date('2026-09-03T12:00:00Z'),
        endsAt: new Date('2026-09-10T12:00:00Z'),
      }),
      findCustomer: jest.fn().mockResolvedValue(null),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const failure = await service
      .checklistForBooking(TENANT, BOOKING, now)
      .then(() => null)
      .catch((error: NotFoundException) => error);
    expect((failure as NotFoundException).getResponse()).toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('requires a passport additionally for a foreign-license customer under the policy', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue({
        tenantId: TENANT,
        requiredTypes: [],
        requirePassportForForeignLicense: true,
      }),
      findBookingContext: jest.fn().mockResolvedValue({
        id: BOOKING,
        customerId: CUSTOMER,
        startsAt: new Date('2026-09-03T12:00:00Z'),
        endsAt: new Date('2026-09-10T12:00:00Z'),
      }),
      findCustomer: jest.fn().mockResolvedValue({ id: CUSTOMER, licenseCountry: 'FR' }),
      listCustomerDocuments: jest.fn().mockResolvedValue([licenseDocument('VERIFIED', new Date('2030-01-01T00:00:00Z'))]),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const checklist = await service.checklistForBooking(TENANT, BOOKING, now);
    expect(checklist.required).toEqual(['DRIVER_LICENSE', 'PASSPORT']);
    expect(checklist.complete).toBe(false);
    expect(checklist.items.map((item) => item.status)).toEqual(['VERIFIED', 'NOT_SUBMITTED']);
  });

  it('is complete when every required document is VERIFIED through the return', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue(null),
      findBookingContext: jest.fn().mockResolvedValue({
        id: BOOKING,
        customerId: CUSTOMER,
        startsAt: new Date('2026-09-03T12:00:00Z'),
        endsAt: new Date('2026-09-10T12:00:00Z'),
      }),
      findCustomer: jest.fn().mockResolvedValue({ id: CUSTOMER, licenseCountry: 'DZ' }),
      listCustomerDocuments: jest.fn().mockResolvedValue([licenseDocument('VERIFIED', new Date('2030-01-01T00:00:00Z'))]),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const checklist = await service.checklistForBooking(TENANT, BOOKING, now);
    expect(checklist.customerLinked).toBe(true);
    expect(checklist.complete).toBe(true);
  });
});

describe('DocumentsService.assertReadyForPickup (08-A04 gate)', () => {
  const interval = { start: new Date('2026-09-03T12:00:00Z'), end: new Date('2026-09-10T12:00:00Z') };

  it('is a no-op for walk-in bookings without a linked customer (R1)', async () => {
    const repository = makeRepository();
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    await expect(service.assertReadyForPickup(TENANT, null, interval, now)).resolves.toBeUndefined();
    expect(repository.findCustomer).not.toHaveBeenCalled();
  });

  it('404s when the linked customer is missing', async () => {
    const repository = makeRepository({ findCustomer: jest.fn().mockResolvedValue(null) });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const failure = await service
      .assertReadyForPickup(TENANT, CUSTOMER, interval, now)
      .then(() => null)
      .catch((error: NotFoundException) => error);
    expect((failure as NotFoundException).getResponse()).toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('rejects with BOOKING_DOCUMENTS_INCOMPLETE and the missing types when not complete', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue(null),
      findCustomer: jest.fn().mockResolvedValue({ id: CUSTOMER, licenseCountry: 'DZ' }),
      listCustomerDocuments: jest.fn().mockResolvedValue([licenseDocument('PENDING', new Date('2030-01-01T00:00:00Z'))]),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const failure = await service
      .assertReadyForPickup(TENANT, CUSTOMER, interval, now)
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'BOOKING_DOCUMENTS_INCOMPLETE',
      details: { missing: ['DRIVER_LICENSE'] },
    });
  });

  it('rejects a VERIFIED license expiring before the return (08-A05)', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue(null),
      findCustomer: jest.fn().mockResolvedValue({ id: CUSTOMER, licenseCountry: 'DZ' }),
      listCustomerDocuments: jest.fn().mockResolvedValue([licenseDocument('VERIFIED', new Date('2026-09-05T12:00:00Z'))]),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    const failure = await service
      .assertReadyForPickup(TENANT, CUSTOMER, interval, now)
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({
      code: 'BOOKING_DOCUMENTS_INCOMPLETE',
      details: { missing: ['DRIVER_LICENSE'] },
    });
  });

  it('resolves when every required document is VERIFIED through the return', async () => {
    const repository = makeRepository({
      findPolicy: jest.fn().mockResolvedValue(null),
      findCustomer: jest.fn().mockResolvedValue({ id: CUSTOMER, licenseCountry: 'DZ' }),
      listCustomerDocuments: jest.fn().mockResolvedValue([licenseDocument('VERIFIED', new Date('2030-01-01T00:00:00Z'))]),
    });
    const service = new DocumentsService(repository as unknown as DocumentsRepository);
    await expect(service.assertReadyForPickup(TENANT, CUSTOMER, interval, now)).resolves.toBeUndefined();
  });
});
