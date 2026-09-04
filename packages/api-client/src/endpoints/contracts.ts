import { ApiClient } from '../client';
import type { TemplateLocale } from './templates';

/**
 * Typed rental-contract endpoints (PHASE-08 08-C). Mirrors
 * apps/api/src/contracts/presentation/contracts.controller.ts and the
 * me-portal customer surface. Agency references are server-derived from
 * the caller's membership; contract content is always server-assembled.
 */

export interface ContractSnapshotDto {
  templateCode: string;
  templateVersion: number | null;
  locale: TemplateLocale;
  title: string;
  variables: Record<string, string | number | null>;
  contentHash: string;
  contentText: string;
  createdAt: string;
}

export interface ContractSignatureDto {
  method: 'CUSTOMER_DIGITAL' | 'ON_SITE';
  signerRole: 'CUSTOMER' | 'AGENCY_REPRESENTATIVE';
  signerName: string;
  note: string | null;
  signedAt: string;
  templateVersion: number | null;
  contentHash: string;
}

export interface ContractDocumentDto {
  id: string;
  title: string;
  contentType: string;
  sizeBytes: number;
}

export interface ContractResponseDto {
  id: string;
  bookingId: string;
  contractNumber: string;
  status: 'ISSUED' | 'SIGNED' | 'CANCELLED';
  locale: TemplateLocale;
  issuedAt: string;
  snapshot: ContractSnapshotDto | null;
  signature: ContractSignatureDto | null;
  document: ContractDocumentDto | null;
}

export interface ContractListResponseDto {
  items: ContractResponseDto[];
}

export interface ContractSignatureInput {
  method: 'CUSTOMER_DIGITAL' | 'ON_SITE';
  signerRole: 'CUSTOMER' | 'AGENCY_REPRESENTATIVE';
  signerName: string;
  note?: string;
}

export interface ReceiptResponseDto {
  id: string;
  bookingId: string;
  contractId: string;
  receiptNumber: string;
  kind: string;
  locale: TemplateLocale;
  totals: { currency: string; totalMinor: number; depositMinor: number };
  contentHash: string;
  contentText: string;
  createdAt: string;
  document: ContractDocumentDto | null;
}

export interface ReceiptListResponseDto {
  items: ReceiptResponseDto[];
}

export interface ContractDownloadResponseDto {
  url: string;
  expiresAt: string;
  contentType: string;
  sizeBytes: number;
  title: string;
}

export interface ContractsApi {
  /** POST /agencies/:agencyId/bookings/:bookingId/contracts (201). */
  issue(agencyId: string, bookingId: string, input?: { locale?: TemplateLocale }): Promise<ContractResponseDto>;
  /** GET /agencies/:agencyId/bookings/:bookingId/contracts. */
  listForBooking(agencyId: string, bookingId: string): Promise<ContractListResponseDto>;
  /** GET /agencies/:agencyId/contracts/:contractId. */
  get(agencyId: string, contractId: string): Promise<ContractResponseDto>;
  /** POST /agencies/:agencyId/contracts/:contractId/signature (201). */
  sign(agencyId: string, contractId: string, input: ContractSignatureInput): Promise<ContractResponseDto>;
  /** POST /agencies/:agencyId/bookings/:bookingId/receipts (201). */
  generateReceipt(agencyId: string, bookingId: string): Promise<ReceiptResponseDto>;
  /** GET /agencies/:agencyId/receipts. */
  listReceipts(agencyId: string): Promise<ReceiptListResponseDto>;
  /** GET /agencies/:agencyId/receipts/:receiptId. */
  getReceipt(agencyId: string, receiptId: string): Promise<ReceiptResponseDto>;
  /** GET /agencies/:agencyId/documents/:documentId/url. */
  downloadUrl(agencyId: string, documentId: string): Promise<ContractDownloadResponseDto>;
}

export interface MeContractsApi {
  /** GET /me/bookings/:bookingId/contracts. */
  listForBooking(bookingId: string): Promise<ContractListResponseDto>;
  /** GET /me/contracts/:contractId. */
  get(contractId: string): Promise<ContractResponseDto>;
  /** POST /me/contracts/:contractId/signature (201; CUSTOMER role enforced). */
  sign(contractId: string, input: { method: 'CUSTOMER_DIGITAL' | 'ON_SITE'; signerName: string; note?: string }): Promise<ContractResponseDto>;
  /** GET /me/bookings/:bookingId/receipts. */
  listReceipts(bookingId: string): Promise<ReceiptListResponseDto>;
  /** GET /me/receipts/:receiptId. */
  getReceipt(receiptId: string): Promise<ReceiptResponseDto>;
  /** GET /me/documents/:documentId/url. */
  downloadUrl(documentId: string): Promise<ContractDownloadResponseDto>;
}

export function createContractsApi(client: ApiClient): ContractsApi {
  const base = (agencyId: string) => `/agencies/${agencyId}`;
  return {
    issue: (agencyId, bookingId, input) => client.post(`${base(agencyId)}/bookings/${bookingId}/contracts`, input ?? {}),
    listForBooking: (agencyId, bookingId) => client.get(`${base(agencyId)}/bookings/${bookingId}/contracts`),
    get: (agencyId, contractId) => client.get(`${base(agencyId)}/contracts/${contractId}`),
    sign: (agencyId, contractId, input) => client.post(`${base(agencyId)}/contracts/${contractId}/signature`, input),
    generateReceipt: (agencyId, bookingId) => client.post(`${base(agencyId)}/bookings/${bookingId}/receipts`, {}),
    listReceipts: (agencyId) => client.get(`${base(agencyId)}/receipts`),
    getReceipt: (agencyId, receiptId) => client.get(`${base(agencyId)}/receipts/${receiptId}`),
    downloadUrl: (agencyId, documentId) => client.get(`${base(agencyId)}/documents/${documentId}/url`),
  };
}

export function createMeContractsApi(client: ApiClient): MeContractsApi {
  return {
    listForBooking: (bookingId) => client.get(`/me/bookings/${bookingId}/contracts`),
    get: (contractId) => client.get(`/me/contracts/${contractId}`),
    sign: (contractId, input) => client.post(`/me/contracts/${contractId}/signature`, input),
    listReceipts: (bookingId) => client.get(`/me/bookings/${bookingId}/receipts`),
    getReceipt: (receiptId) => client.get(`/me/receipts/${receiptId}`),
    downloadUrl: (documentId) => client.get(`/me/documents/${documentId}/url`),
  };
}
