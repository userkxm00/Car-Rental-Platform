import type { CustomerDocumentType } from '@prisma/client';

/**
 * PHASE-08 / 08-A01: the document type catalog.
 *
 * The authoritative, localized catalog of the customer document types the
 * platform understands. The `CustomerDocumentType` enum is the persisted
 * key; this catalog is the single source of truth for how each type
 * behaves: which fields a record must carry, whether the type can expire,
 * and the ar/fr/en labels (docs/40 localization: Arabic is first-class).
 *
 * Rules are pure data — validation and the checklist evaluation consume
 * this table, never their own copies.
 */

export interface DocumentTypeDefinition {
  type: CustomerDocumentType;
  label: { en: string; fr: string; ar: string };
  /** The document number is required for this type. */
  requiresNumber: boolean;
  /** Issue date is required for this type. */
  requiresIssueDate: boolean;
  /** Expiry date is required for this type. */
  requiresExpiryDate: boolean;
  /** Whether the type expires at all (08-A05: expiry evaluation). */
  expires: boolean;
}

export const DOCUMENT_TYPE_CATALOG: readonly DocumentTypeDefinition[] = [
  {
    type: 'DRIVER_LICENSE',
    label: { en: 'Driving license', fr: 'Permis de conduire', ar: 'رخصة القيادة' },
    requiresNumber: true,
    requiresIssueDate: true,
    requiresExpiryDate: true,
    expires: true,
  },
  {
    type: 'NATIONAL_ID',
    label: { en: 'National ID card', fr: 'Carte d’identité nationale', ar: 'بطاقة الهوية الوطنية' },
    requiresNumber: true,
    requiresIssueDate: false,
    requiresExpiryDate: true,
    expires: true,
  },
  {
    type: 'PASSPORT',
    label: { en: 'Passport', fr: 'Passeport', ar: 'جواز السفر' },
    requiresNumber: true,
    requiresIssueDate: true,
    requiresExpiryDate: true,
    expires: true,
  },
  {
    type: 'RESIDENCE_PERMIT',
    label: { en: 'Residence permit', fr: 'Titre de séjour', ar: 'بطاقة الإقامة' },
    requiresNumber: true,
    requiresIssueDate: true,
    requiresExpiryDate: true,
    expires: true,
  },
  {
    type: 'OTHER',
    label: { en: 'Other document', fr: 'Autre document', ar: 'وثيقة أخرى' },
    requiresNumber: false,
    requiresIssueDate: false,
    requiresExpiryDate: false,
    expires: false,
  },
] as const;

export const DOCUMENT_TYPE_BY_KEY: ReadonlyMap<CustomerDocumentType, DocumentTypeDefinition> =
  new Map(DOCUMENT_TYPE_CATALOG.map((definition) => [definition.type, definition]));

/** Stable catalog order for checklists (the order above). */
export const DOCUMENT_TYPE_ORDER: readonly CustomerDocumentType[] = DOCUMENT_TYPE_CATALOG.map(
  (definition) => definition.type,
);

export function isDocumentType(value: unknown): value is CustomerDocumentType {
  return typeof value === 'string' && DOCUMENT_TYPE_BY_KEY.has(value as CustomerDocumentType);
}
