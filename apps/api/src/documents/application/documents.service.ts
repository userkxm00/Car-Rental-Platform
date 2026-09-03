import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CustomerDocumentType } from '@prisma/client';
import { isDocumentType } from '../domain/document-catalog';
import {
  DEFAULT_DOCUMENT_POLICY,
  evaluateDocumentChecklist,
  resolveRequiredDocuments,
  type DocumentChecklist,
  type DocumentPolicyShape,
} from '../domain/document-policy-rules';
import type {
  DocumentChecklistResponse,
  DocumentPolicyInput,
  DocumentPolicyResponse,
} from '../domain/documents.contract';
import { DocumentsErrorCode } from '../domain/documents.contract';
import { DocumentsRepository } from '../infrastructure/documents.repository';

/**
 * PHASE-08 / 08-A use-cases: the agency document policy (08-A02), the
 * customer required-document resolution (08-A03), the booking document
 * checklist (08-A04) and the expiry-aware READY_FOR_PICKUP gate (08-A05).
 *
 * The gate is the only state-machine integration: a booking whose linked
 * customer has not produced VERIFIED copies of every required document is
 * never marked READY_FOR_PICKUP. Walk-in bookings without a linked
 * customer are exempt in R1 — their documents attach with the contract
 * workflow (08-C).
 */

@Injectable()
export class DocumentsService {
  constructor(private readonly repository: DocumentsRepository) {}

  /** 08-A02: the configured policy or the documented default. */
  async getPolicy(tenantId: string): Promise<DocumentPolicyResponse> {
    const row = await this.repository.findPolicy(tenantId);
    if (!row) {
      return { ...DEFAULT_DOCUMENT_POLICY, configured: false };
    }
    return {
      requiredTypes: row.requiredTypes,
      requirePassportForForeignLicense: row.requirePassportForForeignLicense,
      configured: true,
    };
  }

  /** 08-A02: validate and persist the agency policy (upsert, one per agency). */
  async upsertPolicy(tenantId: string, input: DocumentPolicyInput): Promise<DocumentPolicyResponse> {
    const requiredTypes = this.parseRequiredTypes(input.requiredTypes);
    const requirePassportForForeignLicense = input.requirePassportForForeignLicense === true;
    await this.repository.upsertPolicy(tenantId, { requiredTypes, requirePassportForForeignLicense });
    return {
      requiredTypes,
      requirePassportForForeignLicense,
      configured: true,
    };
  }

  /**
   * 08-A04/08-A05: the booking's document checklist against the agency
   * policy — every required type must be VERIFIED and must stay valid
   * through the rental's end.
   */
  async checklistForBooking(tenantId: string, bookingId: string, now = new Date()): Promise<DocumentChecklistResponse> {
    const booking = await this.repository.findBookingContext(tenantId, bookingId);
    if (!booking) {
      throw new NotFoundException({
        code: DocumentsErrorCode.BOOKING_NOT_FOUND,
        message: 'Booking not found in this agency.',
      });
    }
    const policy = await this.policyShape(tenantId);

    if (!booking.customerId) {
      // Walk-in: no linked customer yet — the contract workflow (08-C)
      // attaches one. The checklist reports every required type missing.
      const required = resolveRequiredDocuments(policy, null);
      return this.toResponse(
        bookingId,
        false,
        evaluateDocumentChecklist({ required, documents: [], rentalEnd: booking.endsAt, now }),
      );
    }

    const customer = await this.repository.findCustomer(tenantId, booking.customerId);
    if (!customer) {
      throw new NotFoundException({
        code: DocumentsErrorCode.CUSTOMER_NOT_FOUND,
        message: 'Customer not found in this agency.',
      });
    }
    const required = resolveRequiredDocuments(policy, customer.licenseCountry);
    const documents = await this.repository.listCustomerDocuments(customer.id);
    return this.toResponse(
      bookingId,
      true,
      evaluateDocumentChecklist({ required, documents, rentalEnd: booking.endsAt, now }),
    );
  }

  /**
   * 08-A04 gate for the booking state machine (markReady): a linked
   * customer must have a VERIFIED, non-expiring-through-return document
   * for every required type. No customer link → exempt in R1.
   */
  async assertReadyForPickup(
    tenantId: string,
    customerId: string | null,
    interval: { start: Date; end: Date },
    now = new Date(),
  ): Promise<void> {
    if (!customerId) {
      return;
    }
    const policy = await this.policyShape(tenantId);
    const customer = await this.repository.findCustomer(tenantId, customerId);
    if (!customer) {
      throw new NotFoundException({
        code: DocumentsErrorCode.CUSTOMER_NOT_FOUND,
        message: 'Customer not found in this agency.',
      });
    }
    const required = resolveRequiredDocuments(policy, customer.licenseCountry);
    const documents = await this.repository.listCustomerDocuments(customer.id);
    const checklist = evaluateDocumentChecklist({ required, documents, rentalEnd: interval.end, now });
    if (!checklist.complete) {
      const missing = checklist.items.filter((item) => item.status !== 'VERIFIED').map((item) => item.type);
      throw new ConflictException({
        code: DocumentsErrorCode.BOOKING_DOCUMENTS_INCOMPLETE,
        message: 'Required customer documents are not verified.',
        details: { missing },
      });
    }
  }

  private async policyShape(tenantId: string): Promise<DocumentPolicyShape> {
    const row = await this.repository.findPolicy(tenantId);
    return row ?? DEFAULT_DOCUMENT_POLICY;
  }

  private parseRequiredTypes(value: unknown): CustomerDocumentType[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw this.invalidTypes();
    }
    const parsed: CustomerDocumentType[] = [];
    for (const entry of value) {
      if (!isDocumentType(entry)) {
        throw this.invalidTypes();
      }
      parsed.push(entry);
    }
    return [...new Set(parsed)];
  }

  private invalidTypes(): ConflictException {
    return new ConflictException({
      code: DocumentsErrorCode.INVALID_DOCUMENT_TYPES,
      message: 'requiredTypes must be an array of known document types.',
    });
  }

  private toResponse(
    bookingId: string,
    customerLinked: boolean,
    checklist: DocumentChecklist,
  ): DocumentChecklistResponse {
    return { bookingId, customerLinked, ...checklist };
  }
}
