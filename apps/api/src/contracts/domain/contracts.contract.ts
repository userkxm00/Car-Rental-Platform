import type { TemplateLocale } from '../../templates/domain/template-rules';

/**
 * PHASE-08 / 08-C API contract: rental contracts, signatures, receipts
 * and generated document downloads (staff and customer surfaces).
 */

export interface ContractIssuanceInput {
  /** ar | fr | en — defaults to the customer's preferred locale, else ar. */
  locale?: TemplateLocale;
}

export interface ContractSignatureInput {
  method: 'CUSTOMER_DIGITAL' | 'ON_SITE';
  signerRole: 'CUSTOMER' | 'AGENCY_REPRESENTATIVE';
  signerName: string;
  note?: string;
}

export interface ContractSnapshotResponse {
  templateCode: string;
  templateVersion: number | null;
  locale: string;
  variables: Record<string, string | number | null>;
  contentHash: string;
  contentText: string;
  createdAt: string;
}

export interface ContractSignatureResponse {
  method: string;
  signerRole: string;
  signerName: string;
  note: string | null;
  signedAt: string;
  templateVersion: number | null;
  contentHash: string;
}

export interface ContractDocumentResponse {
  id: string;
  title: string;
  contentType: string;
  sizeBytes: number;
}

export interface ContractResponse {
  id: string;
  bookingId: string;
  contractNumber: string;
  status: 'ISSUED' | 'SIGNED' | 'CANCELLED';
  locale: string;
  issuedAt: string;
  snapshot: ContractSnapshotResponse | null;
  signature: ContractSignatureResponse | null;
  document: ContractDocumentResponse | null;
}

export interface ReceiptResponse {
  id: string;
  bookingId: string;
  contractId: string;
  receiptNumber: string;
  kind: string;
  locale: string;
  totals: {
    currency: string;
    totalMinor: number;
    depositMinor: number;
  };
  contentHash: string;
  contentText: string;
  createdAt: string;
  document: ContractDocumentResponse | null;
}

export interface ContractDownloadResponse {
  url: string;
  expiresAt: string;
  contentType: string;
  sizeBytes: number;
  title: string;
}

export interface ContractListResponse {
  items: ContractResponse[];
}

export interface ReceiptListResponse {
  items: ReceiptResponse[];
}
