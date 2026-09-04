import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TemplatesService } from '../../templates/application/templates.service';
import type { TemplateLocale } from '../../templates/domain/template-rules';
import { substituteTemplate } from '../../templates/domain/template-rules';
import { ObjectStorage } from '../../media/ports/object-storage.port';
import { SIGNED_URL_TTL_SECONDS } from '../../media/domain/media-rules';
import { buildContractValues } from '../domain/contract-values';
import {
  contentHashOf,
  contractNumberOf,
  ContractsErrorCode,
  isIssuableBookingStatus,
  isSignatureMethod,
  isSignerRole,
  parseBookingTotals,
  receiptNumberOf,
  RECEIPT_CONTENT,
  resolveContractLocale,
  SIGNATURE_NOTE_MAX,
  SIGNER_NAME_MAX,
} from '../domain/contracts.rules';
import type {
  ContractDownloadResponse,
  ContractListResponse,
  ContractResponse,
  ContractSignatureInput,
  ReceiptListResponse,
  ReceiptResponse,
} from '../domain/contracts.contract';
import { ContractsRepository } from '../infrastructure/contracts.repository';
import type { ContractSignature, GeneratedDocument } from '@prisma/client';
import { renderDocumentPdf } from '../infrastructure/pdf/pdf-renderer';

/**
 * PHASE-08 / 08-C use-cases: rental contract aggregate (08-C01),
 * snapshot (08-C02), signature boundary (08-C03), PDF rendering
 * (08-C04), receipts (08-C05) and downloads (08-C06).
 *
 * Server-authoritative: values are assembled from the booking's own
 * tenant-scoped rows, money comes from the immutable confirmation price
 * snapshot, and the rendered content hash is the integrity anchor that
 * signatures attest to.
 */

const SIGNATURE_METHOD_LABELS: Record<TemplateLocale, Record<'CUSTOMER_DIGITAL' | 'ON_SITE', string>> = {
  ar: { CUSTOMER_DIGITAL: 'توقيع رقمي للعميل', ON_SITE: 'توقيع حضوري' },
  fr: { CUSTOMER_DIGITAL: 'Signature numérique du client', ON_SITE: 'Signature sur site' },
  en: { CUSTOMER_DIGITAL: 'Customer digital signature', ON_SITE: 'On-site signature' },
};

const PDF_CONTENT_TYPE = 'application/pdf';

export interface SignatureCommand {
  method: 'CUSTOMER_DIGITAL' | 'ON_SITE';
  signerRole: 'CUSTOMER' | 'AGENCY_REPRESENTATIVE';
  signerName: string;
  note: string | null;
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly repository: ContractsRepository,
    private readonly templates: TemplatesService,
    private readonly storage: ObjectStorage,
  ) {}

  // ── issuance (08-C01/08-C02/08-C04) ───────────────────────────────────────

  async issueContract(
    tenantId: string,
    bookingId: string,
    actorUserId: string | null,
    input: { locale?: string } | undefined,
  ): Promise<ContractResponse> {
    const booking = await this.repository.findBookingContext(tenantId, bookingId);
    if (!booking) {
      throw new NotFoundException({
        code: ContractsErrorCode.CONTRACT_BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    const existing = await this.repository.findContractByBooking(tenantId, bookingId);
    if (existing) {
      throw new ConflictException({
        code: ContractsErrorCode.CONTRACT_EXISTS,
        message: 'A contract already exists for this booking.',
      });
    }
    if (!isIssuableBookingStatus(booking.status)) {
      throw new ConflictException({
        code: ContractsErrorCode.CONTRACT_BOOKING_NOT_ISSUABLE,
        message: 'The booking is not in a contract-issuable state.',
      });
    }

    const locale = this.resolveLocale(input?.locale, booking.customer?.preferredLocale ?? null);
    const verifiedLicense = booking.customerId
      ? await this.repository.findVerifiedLicense(booking.customerId)
      : null;

    const assembled = buildContractValues({
      tenant: { name: booking.tenant.name },
      booking: {
        bookingNumber: booking.bookingNumber,
        currency: booking.currency,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      },
      customer: booking.customer
        ? {
            firstName: booking.customer.firstName,
            lastName: booking.customer.lastName,
            preferredLocale: booking.customer.preferredLocale,
            licenseNumber: booking.customer.licenseNumber,
            licenseCountry: booking.customer.licenseCountry,
          }
        : null,
      vehicle: booking.assignedVehicle,
      pickupBranch: booking.pickupBranch,
      returnBranch: booking.returnBranch,
      verifiedLicense,
      priceSnapshot: booking.priceSnapshots[0]?.pricingJson ?? null,
    });

    if (assembled.failures.length > 0) {
      const first = assembled.failures[0];
      throw new ConflictException({
        code: first.code,
        message: 'The booking is missing required contract data.',
        details: {
          variables: assembled.failures.map((failure) => failure.variable),
        },
      });
    }

    const now = new Date();
    const rendered = await this.templates.renderForTenant(tenantId, 'RENTAL_CONTRACT', {
      locale,
      asOf: now,
      values: assembled.values,
    });

    const contractNumber = contractNumberOf(booking.bookingNumber);
    const contentHash = contentHashOf(rendered.body);
    const variablesJson = this.toJson(assembled.values);

    // Render the PDF before writing anything so a render failure leaves
    // no half-issued contract behind (clean retry).
    const pdf = await renderDocumentPdf({
      kind: 'RENTAL_CONTRACT',
      locale: rendered.locale,
      agencyName: String(assembled.values.AGENCY_NAME ?? ''),
      title: rendered.title,
      documentNumber: contractNumber,
      issuedAt: now,
      bodyText: rendered.body,
    });

    const { objectKey } = await this.storage.uploadDocument({
      tenantId,
      kind: 'contract',
      data: pdf,
      contentType: PDF_CONTENT_TYPE,
    });

    const contract = await this.repository.createContract({
      tenantId,
      bookingId,
      contractNumber,
      locale,
      issuedById: actorUserId,
    });
    await this.repository.createSnapshot({
      contractId: contract.id,
      templateId: null,
      templateCode: 'RENTAL_CONTRACT',
      templateVersion: rendered.version,
      locale: rendered.locale,
      variablesJson,
      contentText: rendered.body,
      contentHash,
      title: rendered.title,
    });
    await this.repository.createGeneratedDocument({
      tenantId,
      kind: 'RENTAL_CONTRACT',
      bookingId,
      contractId: contract.id,
      receiptId: null,
      locale: rendered.locale,
      title: rendered.title,
      contentHash,
      objectKey,
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: pdf.length,
    });

    return this.contractResponse(tenantId, contract.id);
  }

  // ── signature boundary (08-C03) ───────────────────────────────────────────

  async signContract(
    tenantId: string,
    contractId: string,
    actorUserId: string | null,
    input: ContractSignatureInput,
  ): Promise<ContractResponse> {
    const signatureInput = this.validateSignatureInput(input);
    const contract = await this.repository.findContractById(tenantId, contractId);
    if (!contract) {
      throw new NotFoundException({
        code: ContractsErrorCode.CONTRACT_NOT_FOUND,
        message: 'Contract not found in this agency.',
      });
    }
    if (contract.signature) {
      throw new ConflictException({
        code: ContractsErrorCode.SIGNATURE_EXISTS,
        message: 'This contract is already signed.',
      });
    }
    const snapshot = contract.snapshot;
    if (!snapshot) {
      throw new ConflictException({
        code: ContractsErrorCode.SIGNATURE_INPUT_INVALID,
        message: 'The contract has no snapshot to sign.',
      });
    }

    if (signatureInput.signerRole === 'CUSTOMER') {
      const booking = await this.repository.findBookingContext(tenantId, contract.bookingId);
      const ownerUserId = booking?.customer?.userId ?? null;
      if (!actorUserId || ownerUserId !== actorUserId) {
        throw new ForbiddenException({
          code: ContractsErrorCode.SIGNATURE_INPUT_INVALID,
          message: 'Only the booking customer can sign as CUSTOMER.',
        });
      }
    }

    const signature = await this.repository.createSignature({
      contractId: contract.id,
      method: signatureInput.method,
      signerRole: signatureInput.signerRole,
      signerName: signatureInput.signerName,
      note: signatureInput.note,
      signedByUserId: actorUserId,
      templateVersion: snapshot.templateVersion,
      contentHash: snapshot.contentHash,
    });
    await this.repository.markContractStatus(tenantId, contract.id, 'SIGNED');

    // Regenerate the PDF with the signature evidence block (08-05 gate:
    // signed records reproduce with the actor/time evidence).
    await this.regenerateSignedPdf(tenantId, contract, snapshot.locale as TemplateLocale, signature, snapshot);

    return this.contractResponse(tenantId, contract.id);
  }

  /** 08-C03 me-portal path: the booking customer signs their own contract. */
  async signContractForUser(
    userId: string,
    contractId: string,
    input: ContractSignatureInput,
  ): Promise<ContractResponse> {
    const contract = await this.repository.findContractForUser(userId, contractId);
    if (!contract) {
      throw new NotFoundException({
        code: ContractsErrorCode.CONTRACT_NOT_FOUND,
        message: 'Contract not found.',
      });
    }
    return this.signContract(contract.tenantId, contractId, userId, {
      ...input,
      signerRole: 'CUSTOMER',
    });
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  async getContract(tenantId: string, contractId: string): Promise<ContractResponse> {
    return this.contractResponse(tenantId, contractId);
  }

  async getContractForUser(userId: string, contractId: string): Promise<ContractResponse> {
    const contract = await this.repository.findContractForUser(userId, contractId);
    if (!contract) {
      throw new NotFoundException({
        code: ContractsErrorCode.CONTRACT_NOT_FOUND,
        message: 'Contract not found.',
      });
    }
    return this.contractResponse(contract.tenantId, contractId);
  }

  async listContracts(tenantId: string, bookingId: string): Promise<ContractListResponse> {
    const contract = await this.repository.findContractByBookingId(tenantId, bookingId);
    if (!contract) {
      return { items: [] };
    }
    return { items: [await this.contractResponse(tenantId, contract.id)] };
  }

  async listContractsForUser(userId: string, bookingId: string): Promise<ContractListResponse> {
    const contracts = await this.repository.findContractsForUserByBooking(userId, bookingId);
    const items: ContractResponse[] = [];
    for (const contract of contracts) {
      items.push(await this.contractResponse(contract.tenantId, contract.id));
    }
    return { items };
  }

  async receiptForUserBooking(userId: string, bookingId: string): Promise<ReceiptListResponse> {
    const receipt = await this.repository.findReceiptForUserByBooking(userId, bookingId);
    if (!receipt) {
      return { items: [] };
    }
    return { items: [this.toReceiptResponse(receipt)] };
  }

  // ── receipts (08-C05) ──────────────────────────────────────────────────────

  async generateReceipt(
    tenantId: string,
    bookingId: string,
    actorUserId: string | null,
  ): Promise<ReceiptResponse> {
    const contract = await this.repository.findContractByBookingId(tenantId, bookingId);
    if (!contract) {
      throw new ConflictException({
        code: ContractsErrorCode.RECEIPT_CONTRACT_MISSING,
        message: 'A rental contract must exist before a receipt can be generated.',
      });
    }
    const existing = await this.repository.findReceiptByBooking(tenantId, bookingId);
    if (existing) {
      throw new ConflictException({
        code: ContractsErrorCode.RECEIPT_EXISTS,
        message: 'A receipt already exists for this booking.',
      });
    }
    const booking = await this.repository.findBookingContext(tenantId, bookingId);
    if (!booking) {
      throw new NotFoundException({
        code: ContractsErrorCode.CONTRACT_BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    const totals = parseBookingTotals(booking.priceSnapshots[0]?.pricingJson ?? null);
    if (!totals) {
      throw new ConflictException({
        code: ContractsErrorCode.CONTRACT_PRICING_MISSING,
        message: 'The booking price snapshot is missing or invalid.',
      });
    }

    const locale = contract.locale as TemplateLocale;
    const verifiedLicense = booking.customerId
      ? await this.repository.findVerifiedLicense(booking.customerId)
      : null;
    const assembled = buildContractValues({
      tenant: { name: booking.tenant.name },
      booking: {
        bookingNumber: booking.bookingNumber,
        currency: booking.currency,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      },
      customer: booking.customer
        ? {
            firstName: booking.customer.firstName,
            lastName: booking.customer.lastName,
            preferredLocale: booking.customer.preferredLocale,
            licenseNumber: booking.customer.licenseNumber,
            licenseCountry: booking.customer.licenseCountry,
          }
        : null,
      vehicle: booking.assignedVehicle,
      pickupBranch: booking.pickupBranch,
      returnBranch: booking.returnBranch,
      verifiedLicense,
      priceSnapshot: booking.priceSnapshots[0]?.pricingJson ?? null,
    });
    if (assembled.failures.length > 0) {
      const first = assembled.failures[0];
      throw new ConflictException({
        code: first.code,
        message: 'The booking is missing required receipt data.',
        details: { variables: assembled.failures.map((failure) => failure.variable) },
      });
    }

    const receiptContent = RECEIPT_CONTENT[locale];
    const values = {
      ...assembled.values,
      CONTRACT_NUMBER: contract.contractNumber,
      CONTRACT_DATE: contract.issuedAt,
      AGENCY_NAME: assembled.values.AGENCY_NAME,
    };
    const substituted = substituteTemplate(receiptContent.body, values, locale);
    if (substituted.missing.length > 0) {
      throw new ConflictException({
        code: ContractsErrorCode.RECEIPT_CONTRACT_MISSING,
        message: 'Receipt variables are missing.',
        details: { missing: substituted.missing },
      });
    }
    const contentText = substituted.rendered;
    const contentHash = contentHashOf(contentText);
    const now = new Date();
    const receiptNumber = receiptNumberOf(booking.bookingNumber);

    const pdf = await renderDocumentPdf({
      kind: 'RENTAL_RECEIPT',
      locale,
      agencyName: String(values.AGENCY_NAME ?? ''),
      title: receiptContent.title,
      documentNumber: receiptNumber,
      issuedAt: now,
      bodyText: contentText,
    });
    const { objectKey } = await this.storage.uploadDocument({
      tenantId,
      kind: 'receipt',
      data: pdf,
      contentType: PDF_CONTENT_TYPE,
    });

    const receipt = await this.repository.createReceipt({
      tenantId,
      bookingId,
      contractId: contract.id,
      receiptNumber,
      kind: 'RENTAL_CONTRACT',
      locale,
      totalsJson: this.toJson(totals),
      contentText,
      contentHash,
      createdById: actorUserId,
    });
    await this.repository.createGeneratedDocument({
      tenantId,
      kind: 'RENTAL_RECEIPT',
      bookingId,
      contractId: contract.id,
      receiptId: receipt.id,
      locale,
      title: receiptContent.title,
      contentHash,
      objectKey,
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: pdf.length,
    });

    return this.receiptResponse(tenantId, receipt.id);
  }

  async getReceipt(tenantId: string, receiptId: string): Promise<ReceiptResponse> {
    return this.receiptResponse(tenantId, receiptId);
  }

  async getReceiptForUser(userId: string, receiptId: string): Promise<ReceiptResponse> {
    const receipt = await this.repository.findReceiptForUser(userId, receiptId);
    if (!receipt) {
      throw new NotFoundException({
        code: ContractsErrorCode.RECEIPT_NOT_FOUND,
        message: 'Receipt not found.',
      });
    }
    return this.receiptResponse(receipt.tenantId, receiptId);
  }

  async listReceipts(tenantId: string): Promise<ReceiptListResponse> {
    const receipts = await this.repository.listReceiptsForTenant(tenantId);
    return {
      items: receipts.map((receipt) => this.toReceiptResponse(receipt)),
    };
  }

  // ── download (08-C06) ──────────────────────────────────────────────────────

  async downloadDocument(tenantId: string, documentId: string): Promise<ContractDownloadResponse> {
    const document = await this.repository.findGeneratedDocument(tenantId, documentId);
    if (!document) {
      throw new NotFoundException({
        code: ContractsErrorCode.CONTRACT_DOCUMENT_NOT_FOUND,
        message: 'Document not found in this agency.',
      });
    }
    return this.toDownloadResponse(document);
  }

  async downloadDocumentForUser(userId: string, documentId: string): Promise<ContractDownloadResponse> {
    const contract = await this.repository.findContractForUser(userId, documentId);
    if (contract) {
      const document = contract.documents.find((candidate) => candidate.id === documentId);
      if (document) {
        return this.toDownloadResponse(document);
      }
    }
    const receipt = await this.repository.findReceiptForUser(userId, documentId);
    if (receipt) {
      const document = receipt.documents.find((candidate) => candidate.id === documentId);
      if (document) {
        return this.toDownloadResponse(document);
      }
    }
    throw new NotFoundException({
      code: ContractsErrorCode.CONTRACT_DOCUMENT_NOT_FOUND,
      message: 'Document not found.',
    });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private resolveLocale(requested: string | undefined, preferred: string | null): TemplateLocale {
    if (requested !== undefined && !['ar', 'fr', 'en'].includes(requested)) {
      throw new ConflictException({
        code: ContractsErrorCode.CONTRACT_LOCALE_INVALID,
        message: 'locale must be one of ar, fr, en.',
      });
    }
    return resolveContractLocale(requested ?? preferred);
  }

  private validateSignatureInput(input: ContractSignatureInput): SignatureCommand {
    if (!isSignatureMethod(input?.method) || !isSignerRole(input?.signerRole)) {
      throw new ConflictException({
        code: ContractsErrorCode.SIGNATURE_INPUT_INVALID,
        message: 'method/signerRole are invalid.',
      });
    }
    const signerName = typeof input.signerName === 'string' ? input.signerName.trim() : '';
    if (signerName.length === 0 || signerName.length > SIGNER_NAME_MAX) {
      throw new ConflictException({
        code: ContractsErrorCode.SIGNATURE_INPUT_INVALID,
        message: `signerName must be 1-${SIGNER_NAME_MAX} characters.`,
      });
    }
    const note = input.note === undefined || input.note === null ? null : String(input.note).trim();
    if (note !== null && note.length > SIGNATURE_NOTE_MAX) {
      throw new ConflictException({
        code: ContractsErrorCode.SIGNATURE_INPUT_INVALID,
        message: `note must be at most ${SIGNATURE_NOTE_MAX} characters.`,
      });
    }
    return {
      method: input.method,
      signerRole: input.signerRole,
      signerName,
      note,
    };
  }

  private async regenerateSignedPdf(
    tenantId: string,
    contract: { id: string; bookingId: string; contractNumber: string },
    snapshotLocale: TemplateLocale,
    signature: ContractSignature,
    snapshot: { contentText: string; contentHash: string; title: string },
  ): Promise<void> {
    const pdf = await renderDocumentPdf({
      kind: 'RENTAL_CONTRACT',
      locale: snapshotLocale,
      agencyName: contract.contractNumber,
      title: snapshot.title,
      documentNumber: contract.contractNumber,
      issuedAt: signature.signedAt,
      bodyText: snapshot.contentText,
      signature: {
        signerName: signature.signerName,
        methodLabel: SIGNATURE_METHOD_LABELS[snapshotLocale][signature.method],
        signedAt: signature.signedAt,
      },
    });
    const { objectKey } = await this.storage.uploadDocument({
      tenantId,
      kind: 'contract',
      data: pdf,
      contentType: PDF_CONTENT_TYPE,
    });
    await this.repository.createGeneratedDocument({
      tenantId,
      kind: 'RENTAL_CONTRACT',
      bookingId: contract.bookingId,
      contractId: contract.id,
      receiptId: null,
      locale: snapshotLocale,
      title: snapshot.title,
      contentHash: snapshot.contentHash,
      objectKey,
      contentType: PDF_CONTENT_TYPE,
      sizeBytes: pdf.length,
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async toDownloadResponse(document: GeneratedDocument): Promise<ContractDownloadResponse> {
    const url = await this.storage.createSignedDownloadUrl(document.objectKey, SIGNED_URL_TTL_SECONDS);
    return {
      url,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      title: document.title,
    };
  }

  private toReceiptResponse(receipt: {
    id: string;
    bookingId: string;
    contractId: string;
    receiptNumber: string;
    kind: string;
    locale: string;
    totalsJson: Prisma.JsonValue;
    contentHash: string;
    contentText: string;
    createdAt: Date;
    documents: GeneratedDocument[];
  }): ReceiptResponse {
    const totals = parseBookingTotals(receipt.totalsJson) ?? {
      currency: 'DZD',
      totalMinor: 0,
      depositMinor: 0,
    };
    const document = this.latest(receipt.documents);
    return {
      id: receipt.id,
      bookingId: receipt.bookingId,
      contractId: receipt.contractId,
      receiptNumber: receipt.receiptNumber,
      kind: receipt.kind,
      locale: receipt.locale,
      totals,
      contentHash: receipt.contentHash,
      contentText: receipt.contentText,
      createdAt: receipt.createdAt.toISOString(),
      document: document
        ? { id: document.id, title: document.title, contentType: document.contentType, sizeBytes: document.sizeBytes }
        : null,
    };
  }

  private latest(documents: GeneratedDocument[]): GeneratedDocument | null {
    if (documents.length === 0) {
      return null;
    }
    return [...documents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  private async receiptResponse(tenantId: string, receiptId: string): Promise<ReceiptResponse> {
    const receipt = await this.repository.findReceiptById(tenantId, receiptId);
    if (!receipt) {
      throw new NotFoundException({
        code: ContractsErrorCode.RECEIPT_NOT_FOUND,
        message: 'Receipt not found in this agency.',
      });
    }
    return this.toReceiptResponse(receipt);
  }

  private async contractResponse(tenantId: string, contractId: string): Promise<ContractResponse> {
    const contract = await this.repository.findContractById(tenantId, contractId);
    if (!contract) {
      throw new NotFoundException({
        code: ContractsErrorCode.CONTRACT_NOT_FOUND,
        message: 'Contract not found in this agency.',
      });
    }
    const snapshot = contract.snapshot;
    const document = this.latest(contract.documents);
    const variables = snapshot
      ? (() => {
          const parsed: unknown = snapshot.variablesJson;
          return (parsed === null || typeof parsed !== 'object'
            ? {}
            : parsed) as Record<string, string | number | null>;
        })()
      : {};
    return {
      id: contract.id,
      bookingId: contract.bookingId,
      contractNumber: contract.contractNumber,
      status: contract.status,
      locale: contract.locale,
      issuedAt: contract.issuedAt.toISOString(),
      snapshot: snapshot
        ? {
            templateCode: snapshot.templateCode,
            templateVersion: snapshot.templateVersion,
            locale: snapshot.locale,
            variables,
            contentHash: snapshot.contentHash,
            contentText: snapshot.contentText,
            createdAt: snapshot.createdAt.toISOString(),
          }
        : null,
      signature: contract.signature
        ? {
            method: contract.signature.method,
            signerRole: contract.signature.signerRole,
            signerName: contract.signature.signerName,
            note: contract.signature.note,
            signedAt: contract.signature.signedAt.toISOString(),
            templateVersion: contract.signature.templateVersion,
            contentHash: contract.signature.contentHash,
          }
        : null,
      document: document
        ? { id: document.id, title: document.title, contentType: document.contentType, sizeBytes: document.sizeBytes }
        : null,
    };
  }
}
