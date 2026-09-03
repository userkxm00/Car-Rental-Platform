import { DOCUMENT_TYPE_ORDER } from './document-catalog';
import type { CustomerDocumentStatus } from '@prisma/client';
import {
  DEFAULT_DOCUMENT_POLICY,
  evaluateDocumentChecklist,
  resolveRequiredDocuments,
  type DocumentPolicyShape,
} from './document-policy-rules';

const doc = (
  type: 'DRIVER_LICENSE' | 'PASSPORT' | 'NATIONAL_ID' | 'RESIDENCE_PERMIT' | 'OTHER',
  status: CustomerDocumentStatus,
  expiryDate: Date | null,
) => ({ type, status, expiryDate });

const policy = (requiredTypes: string[], requirePassportForForeignLicense: boolean): DocumentPolicyShape => ({
  requiredTypes: requiredTypes as DocumentPolicyShape['requiredTypes'],
  requirePassportForForeignLicense,
});

describe('document-catalog (08-A01)', () => {
  it('covers the five persisted document types in stable checklist order', () => {
    expect(DOCUMENT_TYPE_ORDER).toEqual([
      'DRIVER_LICENSE',
      'NATIONAL_ID',
      'PASSPORT',
      'RESIDENCE_PERMIT',
      'OTHER',
    ]);
  });
});

describe('resolveRequiredDocuments (08-A03)', () => {
  it('always requires a driving license (07-A04 baseline)', () => {
    expect(resolveRequiredDocuments(DEFAULT_DOCUMENT_POLICY, null)).toEqual(['DRIVER_LICENSE']);
  });

  it('adds policy-required types and deduplicates, in catalog order', () => {
    const policyWithExtras = policy(['PASSPORT', 'DRIVER_LICENSE', 'NATIONAL_ID', 'PASSPORT'], false);
    expect(resolveRequiredDocuments(policyWithExtras, 'DZ')).toEqual(['DRIVER_LICENSE', 'NATIONAL_ID', 'PASSPORT']);
  });

  it('requires a passport for a foreign license when the policy opts in', () => {
    const foreignRule = policy([], true);
    expect(resolveRequiredDocuments(foreignRule, 'fr')).toEqual(['DRIVER_LICENSE', 'PASSPORT']);
  });

  it('does not add a passport for an Algerian license (trimmed/cased) or no license country', () => {
    const foreignRule = policy([], true);
    expect(resolveRequiredDocuments(foreignRule, '  dz ')).toEqual(['DRIVER_LICENSE']);
    expect(resolveRequiredDocuments(foreignRule, null)).toEqual(['DRIVER_LICENSE']);
  });
});

describe('evaluateDocumentChecklist (08-A04/08-A05)', () => {
  const now = new Date('2026-09-02T12:00:00Z');
  const rentalEnd = new Date('2026-09-10T12:00:00Z');

  it('reports NOT_SUBMITTED for missing documents and is incomplete', () => {
    const checklist = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE'],
      documents: [],
      rentalEnd,
      now,
    });
    expect(checklist.items).toEqual([{ type: 'DRIVER_LICENSE', status: 'NOT_SUBMITTED', expiresAt: null }]);
    expect(checklist.complete).toBe(false);
  });

  it('maps PENDING and REJECTED records and stays incomplete', () => {
    const checklist = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE'],
      documents: [doc('DRIVER_LICENSE', 'PENDING', new Date('2030-01-01T00:00:00Z'))],
      rentalEnd,
      now,
    });
    expect(checklist.items[0].status).toBe('PENDING');

    const rejected = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE'],
      documents: [doc('DRIVER_LICENSE', 'REJECTED', new Date('2030-01-01T00:00:00Z'))],
      rentalEnd,
      now,
    });
    expect(rejected.items[0].status).toBe('REJECTED');
    expect(rejected.complete).toBe(false);
  });

  it('marks EXPIRED when the document expires before the rental ends (08-A05)', () => {
    const expiresMidRental = new Date('2026-09-05T12:00:00Z'); // after now, before rentalEnd
    const checklist = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE'],
      documents: [doc('DRIVER_LICENSE', 'VERIFIED', expiresMidRental)],
      rentalEnd,
      now,
    });
    expect(checklist.items[0]).toEqual({
      type: 'DRIVER_LICENSE',
      status: 'EXPIRED',
      expiresAt: expiresMidRental.toISOString(),
    });
    expect(checklist.complete).toBe(false);
  });

  it('marks EXPIRED for a document already expired at evaluation time', () => {
    const alreadyExpired = new Date('2026-09-01T12:00:00Z');
    const checklist = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE'],
      documents: [doc('DRIVER_LICENSE', 'VERIFIED', alreadyExpired)],
      rentalEnd,
      now,
    });
    expect(checklist.items[0].status).toBe('EXPIRED');
  });

  it('never expires a non-expiring type (OTHER) even with an expiry date', () => {
    const checklist = evaluateDocumentChecklist({
      required: ['OTHER'],
      documents: [doc('OTHER', 'VERIFIED', new Date('2026-09-03T12:00:00Z'))],
      rentalEnd,
      now,
    });
    expect(checklist.items[0].status).toBe('VERIFIED');
  });

  it('is complete only when every required type is VERIFIED', () => {
    const documents = [
      doc('DRIVER_LICENSE', 'VERIFIED', new Date('2030-01-01T00:00:00Z')),
      doc('PASSPORT', 'VERIFIED', new Date('2030-01-01T00:00:00Z')),
    ];
    const complete = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE', 'PASSPORT'],
      documents,
      rentalEnd,
      now,
    });
    expect(complete.complete).toBe(true);

    const partial = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE', 'PASSPORT'],
      documents: documents.slice(0, 1),
      rentalEnd,
      now,
    });
    expect(partial.complete).toBe(false);
    expect(partial.items.map((item) => item.status)).toEqual(['VERIFIED', 'NOT_SUBMITTED']);
  });

  it('does not count a VERIFIED record as complete once EXPIRED', () => {
    const expired = new Date('2026-09-03T00:00:00Z');
    const checklist = evaluateDocumentChecklist({
      required: ['DRIVER_LICENSE'],
      documents: [doc('DRIVER_LICENSE', 'VERIFIED', expired)],
      rentalEnd,
      now,
    });
    expect(checklist.complete).toBe(false);
  });
});

describe('DEFAULT_DOCUMENT_POLICY', () => {
  it('requires no extra types and no passport rule by default', () => {
    expect(DEFAULT_DOCUMENT_POLICY).toEqual({ requiredTypes: [], requirePassportForForeignLicense: false });
  });
});
