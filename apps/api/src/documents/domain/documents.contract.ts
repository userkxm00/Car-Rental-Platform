import type { CustomerDocumentType } from '@prisma/client';

/**
 * PHASE-08 / 08-A contracts: the agency document policy DTO, the booking
 * checklist answer and the stable error codes.
 */

export const DocumentsErrorCode = {
  /** Policy input contains an unknown document type. */
  INVALID_DOCUMENT_TYPES: 'INVALID_DOCUMENT_TYPES',
  /** READY_FOR_PICKUP gate: some required document is not VERIFIED. */
  BOOKING_DOCUMENTS_INCOMPLETE: 'BOOKING_DOCUMENTS_INCOMPLETE',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
} as const;

export type DocumentsErrorCodeValue = (typeof DocumentsErrorCode)[keyof typeof DocumentsErrorCode];

export interface DocumentPolicyInput {
  requiredTypes?: unknown;
  requirePassportForForeignLicense?: unknown;
}

export interface DocumentPolicyResponse {
  requiredTypes: CustomerDocumentType[];
  requirePassportForForeignLicense: boolean;
  /** True when the agency configured an explicit policy (08-A02). */
  configured: boolean;
}

export interface DocumentChecklistResponse {
  bookingId: string;
  customerLinked: boolean;
  required: CustomerDocumentType[];
  items: Array<{
    type: CustomerDocumentType;
    status: 'NOT_SUBMITTED' | 'PENDING' | 'REJECTED' | 'EXPIRED' | 'VERIFIED';
    expiresAt: string | null;
  }>;
  complete: boolean;
}
