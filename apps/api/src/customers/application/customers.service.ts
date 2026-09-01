import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CustomerDetailResponse,
  CustomerErrorCode,
  CustomerInput,
  CustomerListQuery,
  CustomerListResponse,
  CustomerResponse,
  DocumentInput,
  DocumentResponse,
  LinkCustomerInput,
  VerifyDocumentInput,
} from '../domain/customer-contract';
import {
  computeDocumentRequirements,
  isExpiredDocument,
  licenseDatesAreOrdered,
  parseCustomerPatch,
  parseDocumentPatch,
  REJECTION_REASON_MAX,
} from '../domain/customer-rules';
import { CustomersRepository } from '../infrastructure/customers.repository';
import type { Customer, CustomerDocument } from '@prisma/client';

/**
 * Agency-side customer master (07-A).
 *
 * Boundary validation is delegated to the pure rule functions; this service
 * orchestrates tenant-scoped persistence, the account-link invariants
 * (07-A02) and the document verification state machine (07-A04).
 */

const DEFAULT_LOCALE = 'en';
const LIST_LIMIT_MAX = 100;
const LIST_LIMIT_DEFAULT = 20;

@Injectable()
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async createCustomer(tenantId: string, input: CustomerInput): Promise<CustomerResponse> {
    const now = new Date();
    const parsed = parseCustomerPatch((input ?? {}) as Record<string, unknown>, now);
    if (input?.firstName === undefined || input?.lastName === undefined) {
      parsed.failures.push({
        field: input?.firstName === undefined ? 'firstName' : 'lastName',
        code: CustomerErrorCode.CUSTOMER_NAME_INVALID,
        message: `${input?.firstName === undefined ? 'firstName' : 'lastName'} is required.`,
      });
    }
    if (parsed.failures.length > 0) {
      throw this.validationConflict(parsed.failures[0]);
    }
    const data = {
      tenantId,
      userId: null,
      firstName: parsed.value.firstName ?? '',
      lastName: parsed.value.lastName ?? '',
      phone: parsed.value.phone ?? null,
      email: parsed.value.email ?? null,
      preferredLocale: parsed.value.preferredLocale ?? DEFAULT_LOCALE,
      dateOfBirth: parsed.value.dateOfBirth ?? null,
      licenseNumber: parsed.value.licenseNumber ?? null,
      licenseCountry: parsed.value.licenseCountry ?? (parsed.value.licenseNumber ? 'DZ' : null),
      licenseIssueDate: parsed.value.licenseIssueDate ?? null,
      licenseExpiryDate: parsed.value.licenseExpiryDate ?? null,
    };
    if (!licenseDatesAreOrdered(data, {})) {
      throw new ConflictException({
        code: CustomerErrorCode.CUSTOMER_LICENSE_INVALID,
        message: 'licenseIssueDate must not be after licenseExpiryDate.',
      });
    }
    const customer = await this.repository.createCustomer(data);
    return toCustomerResponse(customer);
  }

  async listCustomers(tenantId: string, query: CustomerListQuery): Promise<CustomerListResponse> {
    const limit = parseLimit(query.limit);
    const offset = parseOffset(query.offset);
    const status = query.status === undefined ? undefined : parseStatus(query.status);
    const search = typeof query.search === 'string' ? query.search : undefined;
    if (status === null) {
      throw new ConflictException({
        code: CustomerErrorCode.CUSTOMER_STATUS_INVALID,
        message: 'status must be one of: ACTIVE, SUSPENDED, ARCHIVED.',
      });
    }
    const { rows, total } = await this.repository.listCustomers(tenantId, {
      search,
      status,
      limit,
      offset,
    });
    return { items: rows.map(toCustomerResponse), total, limit, offset };
  }

  async getCustomerDetail(tenantId: string, customerId: string): Promise<CustomerDetailResponse> {
    const customer = await this.requireCustomer(tenantId, customerId);
    const documents = await this.repository.listDocumentsForCustomer(customer.id);
    return {
      ...toCustomerResponse(customer),
      documents: documents.map(toDocumentResponse),
      documentRequirements: computeDocumentRequirements(documents, new Date()),
    };
  }

  async updateCustomer(tenantId: string, customerId: string, input: CustomerInput): Promise<CustomerResponse> {
    const customer = await this.requireCustomer(tenantId, customerId);
    const parsed = parseCustomerPatch((input ?? {}) as Record<string, unknown>, new Date());
    if (parsed.failures.length > 0) {
      throw this.validationConflict(parsed.failures[0]);
    }
    const patch = parsed.value;
    if (
      patch.licenseNumber !== undefined &&
      patch.licenseNumber !== null &&
      patch.licenseCountry === undefined &&
      !customer.licenseCountry
    ) {
      // Jurisdiction baseline: a license record without a country defaults
      // to the home market (DZ) until agency policy configures otherwise.
      patch.licenseCountry = 'DZ';
    }
    if (!licenseDatesAreOrdered(
      {
        licenseIssueDate: customer.licenseIssueDate,
        licenseExpiryDate: customer.licenseExpiryDate,
      },
      patch,
    )) {
      throw new ConflictException({
        code: CustomerErrorCode.CUSTOMER_LICENSE_INVALID,
        message: 'licenseIssueDate must not be after licenseExpiryDate.',
      });
    }
    const updated = await this.repository.updateCustomer(tenantId, customerId, patch as Prisma.CustomerUpdateInput);
    if (!updated) {
      throw new NotFoundException({
        code: CustomerErrorCode.CUSTOMER_NOT_FOUND,
        message: 'Customer not found in this agency.',
      });
    }
    return toCustomerResponse(updated);
  }

  /** 07-A02: link a platform account (by verified email) to the record. */
  async linkCustomer(tenantId: string, customerId: string, input: LinkCustomerInput): Promise<CustomerResponse> {
    const customer = await this.requireCustomer(tenantId, customerId);
    if (customer.userId) {
      throw new ConflictException({
        code: CustomerErrorCode.CUSTOMER_ALREADY_LINKED,
        message: 'This customer record is already linked to a platform account.',
      });
    }
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (email.length === 0) {
      throw new ConflictException({
        code: CustomerErrorCode.CUSTOMER_EMAIL_INVALID,
        message: 'email is required to link a platform account.',
      });
    }
    const user = await this.repository.findUserByEmail(email);
    if (!user) {
      throw new NotFoundException({
        code: CustomerErrorCode.USER_NOT_FOUND,
        message: 'No platform account exists for this email.',
      });
    }
    if (user.status !== 'ACTIVE') {
      throw new ConflictException({
        code: CustomerErrorCode.USER_LINK_DISABLED,
        message: 'This platform account is suspended or deactivated.',
      });
    }
    try {
      const linked = await this.repository.linkCustomer(tenantId, customerId, user.id);
      return toCustomerResponse(linked);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: CustomerErrorCode.CUSTOMER_LINK_TAKEN,
          message: 'This platform account is already linked to another customer record in this agency.',
        });
      }
      throw error;
    }
  }

  async unlinkCustomer(tenantId: string, customerId: string): Promise<CustomerResponse> {
    const customer = await this.requireCustomer(tenantId, customerId);
    if (!customer.userId) {
      throw new ConflictException({
        code: CustomerErrorCode.CUSTOMER_NOT_LINKED,
        message: 'This customer record is not linked to a platform account.',
      });
    }
    const unlinked = await this.repository.unlinkCustomer(tenantId, customerId);
    return toCustomerResponse(unlinked);
  }

  // ── Documents (07-A04) ───────────────────────────────────────────────────

  async createDocument(tenantId: string, customerId: string, input: DocumentInput): Promise<DocumentResponse> {
    const customer = await this.requireCustomer(tenantId, customerId);
    const parsed = parseDocumentPatch((input ?? {}) as Record<string, unknown>, new Date());
    if (parsed.value.type === undefined) {
      parsed.failures.push({
        field: 'type',
        code: CustomerErrorCode.DOCUMENT_TYPE_INVALID,
        message: 'type is required.',
      });
    }
    if (parsed.failures.length > 0) {
      throw this.validationConflict(parsed.failures[0]);
    }
    const type = parsed.value.type!;
    const existing = (await this.repository.listDocumentsForCustomer(customer.id)).find(
      (doc) => doc.type === type,
    );
    if (existing) {
      throw new ConflictException({
        code: CustomerErrorCode.DOCUMENT_TYPE_EXISTS,
        message: `A ${type} document already exists — update it instead.`,
      });
    }
    const document = await this.repository.createDocument({
      customerId: customer.id,
      type,
      number: parsed.value.number ?? null,
      issueDate: parsed.value.issueDate ?? null,
      expiryDate: parsed.value.expiryDate ?? null,
    });
    return toDocumentResponse(document);
  }

  async listDocuments(tenantId: string, customerId: string): Promise<DocumentResponse[]> {
    const customer = await this.requireCustomer(tenantId, customerId);
    const documents = await this.repository.listDocumentsForCustomer(customer.id);
    return documents.map(toDocumentResponse);
  }

  /**
   * Agency metadata edit: any change invalidates the verification — the
   * document returns to PENDING (07-A04 state machine).
   */
  async updateDocument(
    tenantId: string,
    customerId: string,
    documentId: string,
    input: DocumentInput,
  ): Promise<DocumentResponse> {
    const customer = await this.requireCustomer(tenantId, customerId);
    await this.requireDocument(customer.id, documentId);
    const parsed = parseDocumentPatch((input ?? {}) as Record<string, unknown>, new Date());
    if (parsed.failures.length > 0) {
      throw this.validationConflict(parsed.failures[0]);
    }
    const patch = parsed.value;
    if (
      patch.issueDate !== undefined &&
      patch.expiryDate !== undefined &&
      patch.issueDate !== null &&
      patch.expiryDate !== null &&
      patch.issueDate.getTime() > patch.expiryDate.getTime()
    ) {
      throw new ConflictException({
        code: CustomerErrorCode.DOCUMENT_DATES_INVALID,
        message: 'issueDate must not be after expiryDate.',
      });
    }
    const updated = await this.repository.updateDocument(customer.id, documentId, {
      ...patch,
      // Metadata changed: verification evidence no longer applies.
      status: 'PENDING',
      verifiedAt: null,
      verifiedBy: null,
      rejectionReason: null,
    });
    if (!updated) {
      throw new NotFoundException({
        code: CustomerErrorCode.DOCUMENT_NOT_FOUND,
        message: 'Document not found.',
      });
    }
    return toDocumentResponse(updated);
  }

  /** Verification action (staff): PENDING → VERIFIED | REJECTED. */
  async verifyDocument(
    tenantId: string,
    customerId: string,
    documentId: string,
    actorUserId: string,
    input: VerifyDocumentInput,
  ): Promise<DocumentResponse> {
    const customer = await this.requireCustomer(tenantId, customerId);
    const document = await this.requireDocument(customer.id, documentId);
    const decision = input?.decision;
    if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
      throw new ConflictException({
        code: CustomerErrorCode.DOCUMENT_STATUS_TRANSITION_INVALID,
        message: 'decision must be VERIFIED or REJECTED.',
      });
    }
    if (document.status !== 'PENDING') {
      throw new ConflictException({
        code: CustomerErrorCode.DOCUMENT_STATUS_TRANSITION_INVALID,
        message: `A ${document.status.toLowerCase()} document cannot be verified — only PENDING documents.`,
      });
    }
    let rejectionReason: string | null = null;
    if (decision === 'REJECTED') {
      const reason = typeof input.rejectionReason === 'string' ? input.rejectionReason.trim() : '';
      if (reason.length < 1 || reason.length > REJECTION_REASON_MAX) {
        throw new ConflictException({
          code: CustomerErrorCode.DOCUMENT_REJECTION_REASON_REQUIRED,
          message: `rejectionReason is required (1–${REJECTION_REASON_MAX} characters).`,
        });
      }
      rejectionReason = reason;
    }
    const updated = await this.repository.updateDocument(customer.id, documentId, {
      status: decision,
      verifiedAt: new Date(),
      verifiedBy: actorUserId,
      rejectionReason,
    });
    if (!updated) {
      throw new NotFoundException({
        code: CustomerErrorCode.DOCUMENT_NOT_FOUND,
        message: 'Document not found.',
      });
    }
    return toDocumentResponse(updated);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async requireCustomer(tenantId: string, customerId: string): Promise<Customer> {
    const customer = await this.repository.findCustomerInTenant(tenantId, customerId);
    if (!customer) {
      throw new NotFoundException({
        code: CustomerErrorCode.CUSTOMER_NOT_FOUND,
        message: 'Customer not found in this agency.',
      });
    }
    return customer;
  }

  private async requireDocument(customerId: string, documentId: string): Promise<CustomerDocument> {
    const document = await this.repository.findDocument(customerId, documentId);
    if (!document) {
      throw new NotFoundException({
        code: CustomerErrorCode.DOCUMENT_NOT_FOUND,
        message: 'Document not found.',
      });
    }
    return document;
  }

  private validationConflict(fail: { code: string; message: string }): ConflictException {
    return new ConflictException({ code: fail.code, message: fail.message });
  }
}

// ── serializers ─────────────────────────────────────────────────────────────

const toISODate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

function toCustomerResponse(customer: Customer): CustomerResponse {
  return {
    id: customer.id,
    tenantId: customer.tenantId,
    userId: customer.userId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    email: customer.email,
    preferredLocale: customer.preferredLocale,
    dateOfBirth: toISODate(customer.dateOfBirth),
    licenseNumber: customer.licenseNumber,
    licenseCountry: customer.licenseCountry,
    licenseIssueDate: toISODate(customer.licenseIssueDate),
    licenseExpiryDate: toISODate(customer.licenseExpiryDate),
    status: customer.status,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function toDocumentResponse(document: CustomerDocument): DocumentResponse {
  return {
    id: document.id,
    customerId: document.customerId,
    type: document.type,
    number: document.number,
    issueDate: toISODate(document.issueDate),
    expiryDate: toISODate(document.expiryDate),
    status: document.status,
    mediaObjectId: document.mediaObjectId,
    verifiedAt: document.verifiedAt ? document.verifiedAt.toISOString() : null,
    rejectionReason: document.rejectionReason,
    expired: isExpiredDocument(document.expiryDate, new Date()),
    createdAt: document.createdAt.toISOString(),
  };
}

function toBoundedInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d{1,6}$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function parseLimit(value: unknown): number {
  if (value === undefined) {
    return LIST_LIMIT_DEFAULT;
  }
  const numeric = toBoundedInteger(value);
  if (numeric === null || numeric < 1 || numeric > LIST_LIMIT_MAX) {
    throw new ConflictException({
      code: CustomerErrorCode.CUSTOMER_LIST_QUERY_INVALID,
      message: `limit must be an integer between 1 and ${LIST_LIMIT_MAX}.`,
    });
  }
  return numeric;
}

function parseOffset(value: unknown): number {
  if (value === undefined) {
    return 0;
  }
  const numeric = toBoundedInteger(value);
  if (numeric === null || numeric < 0) {
    throw new ConflictException({
      code: CustomerErrorCode.CUSTOMER_LIST_QUERY_INVALID,
      message: 'offset must be a non-negative integer.',
    });
  }
  return numeric;
}

function parseStatus(value: unknown): 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | null {
  if (value === 'ACTIVE' || value === 'SUSPENDED' || value === 'ARCHIVED') {
    return value;
  }
  return null;
}
