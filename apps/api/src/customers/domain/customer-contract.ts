import type {
  CustomerDocumentStatus,
  CustomerDocumentType,
  CustomerStatus,
} from '@prisma/client';

/**
 * Customer identity/profile contract (07-A).
 *
 * Two surfaces share this contract:
 * - the agency-side customer master (`/agencies/:agencyId/customers`,
 *   tenant-scoped, role-gated) — the business customer record used by
 *   bookings, contracts and invoices (database-schema-v1 §5.1);
 * - the marketplace self-service surface (`/me/customers`) — a customer
 *   manages only records linked to their verified platform account
 *   (`customers.userId`, 07-A02).
 *
 * Customer records are tenant-scoped: the same person may exist
 * independently in different agencies; uniqueness is policy-driven and the
 * only hard link invariant is one platform-account link per tenant.
 */

export const CustomerErrorCode = {
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  CUSTOMER_NAME_INVALID: 'CUSTOMER_NAME_INVALID',
  CUSTOMER_PHONE_INVALID: 'CUSTOMER_PHONE_INVALID',
  CUSTOMER_EMAIL_INVALID: 'CUSTOMER_EMAIL_INVALID',
  CUSTOMER_LOCALE_INVALID: 'CUSTOMER_LOCALE_INVALID',
  CUSTOMER_BIRTHDATE_INVALID: 'CUSTOMER_BIRTHDATE_INVALID',
  CUSTOMER_LICENSE_INVALID: 'CUSTOMER_LICENSE_INVALID',
  CUSTOMER_STATUS_INVALID: 'CUSTOMER_STATUS_INVALID',
  CUSTOMER_LIST_QUERY_INVALID: 'CUSTOMER_LIST_QUERY_INVALID',
  CUSTOMER_LINK_TAKEN: 'CUSTOMER_LINK_TAKEN',
  CUSTOMER_ALREADY_LINKED: 'CUSTOMER_ALREADY_LINKED',
  CUSTOMER_NOT_LINKED: 'CUSTOMER_NOT_LINKED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_LINK_DISABLED: 'USER_LINK_DISABLED',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  DOCUMENT_TYPE_INVALID: 'DOCUMENT_TYPE_INVALID',
  DOCUMENT_TYPE_EXISTS: 'DOCUMENT_TYPE_EXISTS',
  DOCUMENT_NUMBER_INVALID: 'DOCUMENT_NUMBER_INVALID',
  DOCUMENT_DATES_INVALID: 'DOCUMENT_DATES_INVALID',
  DOCUMENT_STATUS_TRANSITION_INVALID: 'DOCUMENT_STATUS_TRANSITION_INVALID',
  DOCUMENT_REJECTION_REASON_REQUIRED: 'DOCUMENT_REJECTION_REASON_REQUIRED',
  DOCUMENT_VERIFIED_IMMUTABLE: 'DOCUMENT_VERIFIED_IMMUTABLE',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  FAVORITE_EXISTS: 'FAVORITE_EXISTS',
  FAVORITE_NOT_FOUND: 'FAVORITE_NOT_FOUND',
  SEARCH_CRITERIA_INVALID: 'SEARCH_CRITERIA_INVALID',
} as const;

export type CustomerErrorCodeValue = (typeof CustomerErrorCode)[keyof typeof CustomerErrorCode];

export const CUSTOMER_STATUSES: readonly CustomerStatus[] = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'];

export const DOCUMENT_TYPES: readonly CustomerDocumentType[] = [
  'DRIVER_LICENSE',
  'NATIONAL_ID',
  'PASSPORT',
  'RESIDENCE_PERMIT',
  'OTHER',
];

export const DOCUMENT_STATUSES: readonly CustomerDocumentStatus[] = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
];

/** Raw client input — every field validated at the boundary, never trusted. */
export interface CustomerInput {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  email?: unknown;
  preferredLocale?: unknown;
  dateOfBirth?: unknown;
  licenseNumber?: unknown;
  licenseCountry?: unknown;
  licenseIssueDate?: unknown;
  licenseExpiryDate?: unknown;
  status?: unknown;
}

export interface CustomerListQuery {
  search?: unknown;
  status?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export interface DocumentInput {
  type?: unknown;
  number?: unknown;
  issueDate?: unknown;
  expiryDate?: unknown;
}

export interface VerifyDocumentInput {
  decision?: unknown;
  rejectionReason?: unknown;
}

export interface LinkCustomerInput {
  email?: unknown;
}

export interface CustomerResponse {
  id: string;
  tenantId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  preferredLocale: string;
  dateOfBirth: string | null;
  licenseNumber: string | null;
  licenseCountry: string | null;
  licenseIssueDate: string | null;
  licenseExpiryDate: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: CustomerResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface DocumentResponse {
  id: string;
  customerId: string;
  type: CustomerDocumentType;
  number: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  status: CustomerDocumentStatus;
  mediaObjectId: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  /** Derived, never stored: VERIFIED with a past expiry date. */
  expired: boolean;
  createdAt: string;
}

export type DocumentRequirementReason = 'MISSING' | 'PENDING' | 'REJECTED' | 'EXPIRED';

export interface DocumentRequirement {
  type: CustomerDocumentType;
  reason: DocumentRequirementReason;
}

/**
 * 07-A04: the computed requirements state of a customer's documents against
 * the R1 baseline (driving rentals require a valid driver license; other
 * types are collected on agency policy without blocking).
 */
export interface DocumentRequirements {
  /** Document types R1 treats as mandatory for a driving rental. */
  requiredTypes: CustomerDocumentType[];
  satisfied: boolean;
  unmet: DocumentRequirement[];
}

/** Self-service profile list item: the tenant the record belongs to. */
export interface CustomerProfileListItem extends CustomerResponse {
  agency: { id: string; name: string; slug: string };
}

export interface CustomerDetailResponse extends CustomerResponse {
  documents: DocumentResponse[];
  documentRequirements: DocumentRequirements;
}

export interface FavoriteItem {
  vehicleId: string;
  createdAt: string;
  vehicle: {
    id: string;
    tenantId: string;
    make: string;
    model: string;
    year: number;
    color: string | null;
    categoryId: string;
  };
}

export interface RecentlyViewedItem extends FavoriteItem {
  viewedAt: string;
}

export interface SearchHistoryResponse {
  id: string;
  criteria: Record<string, unknown>;
  createdAt: string;
}

export interface SearchHistoryInput {
  criteria?: unknown;
}

export interface RecentlyViewedInput {
  vehicleId?: unknown;
}
