import type { CustomerDocumentStatus, CustomerDocumentType } from '@prisma/client';
import { DOCUMENT_TYPE_BY_KEY, DOCUMENT_TYPE_ORDER } from './document-catalog';

/**
 * PHASE-08 / 08-A03: customer required-document rules.
 *
 * Pure resolution of the required document set for a booking context:
 *
 * - a driving license is always required (07-A04 baseline);
 * - the agency policy may add required types (08-A02);
 * - when the policy opts in and the customer's license country is not
 *   Algeria, a passport is additionally required (foreign-driver rule,
 *   docs/43 payment/ops strategy: verify identity for non-DZ licenses).
 *
 * The result is a deduplicated list in stable catalog order.
 */

export interface DocumentPolicyShape {
  requiredTypes: CustomerDocumentType[];
  requirePassportForForeignLicense: boolean;
}

export const DEFAULT_DOCUMENT_POLICY: DocumentPolicyShape = {
  requiredTypes: [],
  requirePassportForForeignLicense: false,
};

export const ALWAYS_REQUIRED_DOCUMENT_TYPES: readonly CustomerDocumentType[] = ['DRIVER_LICENSE'];

export function resolveRequiredDocuments(
  policy: DocumentPolicyShape,
  licenseCountry: string | null,
): CustomerDocumentType[] {
  const required = new Set<CustomerDocumentType>(ALWAYS_REQUIRED_DOCUMENT_TYPES);
  for (const type of policy.requiredTypes) {
    required.add(type);
  }
  const normalized = licenseCountry?.trim().toUpperCase() ?? null;
  if (policy.requirePassportForForeignLicense && normalized !== null && normalized !== 'DZ') {
    required.add('PASSPORT');
  }
  return DOCUMENT_TYPE_ORDER.filter((type) => required.has(type));
}

/**
 * PHASE-08 / 08-A04 + 08-A05: booking document checklist evaluation.
 *
 * Per required type, the customer's single record (unique per type)
 * resolves to:
 *
 * - NOT_SUBMITTED — no record at all;
 * - EXPIRED — the document expires before the rental ENDS (08-A05: a
 *   document must stay valid for the whole rental, not just at pickup);
 * - PENDING — a record exists but the agency has not verified it;
 * - REJECTED — the agency explicitly rejected the record;
 * - VERIFIED — the record is accepted and valid through the rental.
 *
 * `complete` is true only when every required type is VERIFIED — the
 * gate the booking state machine consumes at READY_FOR_PICKUP (08-A04).
 */

export type ChecklistItemStatus = 'NOT_SUBMITTED' | 'PENDING' | 'REJECTED' | 'EXPIRED' | 'VERIFIED';

export interface DocumentChecklistItem {
  type: CustomerDocumentType;
  status: ChecklistItemStatus;
  expiresAt: string | null;
}

export interface DocumentChecklist {
  required: CustomerDocumentType[];
  items: DocumentChecklistItem[];
  complete: boolean;
}

export interface ChecklistDocumentLike {
  type: CustomerDocumentType;
  status: CustomerDocumentStatus;
  expiryDate: Date | null;
}

export function evaluateDocumentChecklist(input: {
  required: CustomerDocumentType[];
  documents: ChecklistDocumentLike[];
  rentalEnd: Date;
  now: Date;
}): DocumentChecklist {
  const byType = new Map<CustomerDocumentType, ChecklistDocumentLike>(
    input.documents.map((document) => [document.type, document]),
  );

  const items: DocumentChecklistItem[] = input.required.map((type) => {
    const document = byType.get(type);
    const expires = DOCUMENT_TYPE_BY_KEY.get(type)?.expires ?? false;
    if (!document) {
      return { type, status: 'NOT_SUBMITTED', expiresAt: null };
    }
    const expiringBeforeReturn =
      expires && document.expiryDate !== null && document.expiryDate.getTime() < input.rentalEnd.getTime();
    const alreadyExpired =
      expires && document.expiryDate !== null && document.expiryDate.getTime() < input.now.getTime();
    if (expiringBeforeReturn || alreadyExpired) {
      return {
        type,
        status: 'EXPIRED',
        expiresAt: document.expiryDate ? document.expiryDate.toISOString() : null,
      };
    }
    const status: ChecklistItemStatus =
      document.status === 'VERIFIED' ? 'VERIFIED' : document.status === 'REJECTED' ? 'REJECTED' : 'PENDING';
    return {
      type,
      status,
      expiresAt: document.expiryDate ? document.expiryDate.toISOString() : null,
    };
  });

  return {
    required: input.required,
    items,
    complete: items.every((item) => item.status === 'VERIFIED'),
  };
}
