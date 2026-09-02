import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VehicleRepository } from '../../fleet/infrastructure/vehicle.repository';
import {
  CustomerDetailResponse,
  CustomerErrorCode,
  CustomerInput,
  CustomerProfileListItem,
  CustomerResponse,
  DocumentInput,
  DocumentResponse,
  FavoriteItem,
  RecentlyViewedInput,
  RecentlyViewedItem,
  SearchHistoryInput,
  SearchHistoryResponse,
} from '../domain/customer-contract';
import {
  computeDocumentRequirements,
  isExpiredDocument,
  licenseDatesAreOrdered,
  parseCustomerPatch,
  parseDocumentPatch,
} from '../domain/customer-rules';
import { CustomerSelfRepository } from '../infrastructure/customer-self.repository';
import type { Customer, CustomerDocument } from '@prisma/client';

/**
 * Marketplace self-service (07-A02/07-A03 + 07-A05…A07).
 *
 * The caller's user id comes from the resolved verified principal — the
 * client can never name another user. Own-record operations resolve through
 * the `customers.userId` linkage; signals (favorites, recently viewed,
 * search history) are user-scoped and cross-agency by design (the
 * marketplace spans agencies).
 */

@Injectable()
export class CustomerSelfService {
  constructor(
    private readonly repository: CustomerSelfRepository,
    private readonly vehicles: VehicleRepository,
  ) {}

  // ── Own profiles (07-A02/07-A03) ─────────────────────────────────────────

  /**
   * 07-E05: resolve-or-create the caller's customer record for one agency.
   *
   * The link is unique per (tenant, user); a second call for the same
   * agency returns the same record. Fresh records carry the user's
   * display name as a starting point — the customer edits details later
   * through the existing /me/customers profile surface (07-A03).
   */
  async ensureCustomerForAgency(userId: string, tenantId: string): Promise<CustomerResponse> {
    const existing = await this.repository.findByUserAndTenant(userId, tenantId);
    if (existing) {
      return toCustomerResponse(existing);
    }
    const user = await this.repository.findUser(userId);
    if (!user) {
      throw new NotFoundException({
        code: CustomerErrorCode.CUSTOMER_NOT_FOUND,
        message: 'No application user found for this identity.',
      });
    }
    const created = await this.repository.createOwnCustomer({
      tenantId,
      userId,
      firstName: user.displayName?.trim() || 'Customer',
      lastName: 'Customer',
      phone: user.phone ?? null,
      email: user.email ?? null,
      preferredLocale: user.preferredLocale || 'en',
    });
    return toCustomerResponse(created);
  }

  async listMyProfiles(userId: string): Promise<CustomerProfileListItem[]> {
    const rows = await this.repository.listOwnCustomers(userId);
    return rows.map((row) => ({
      ...toCustomerResponse(row),
      agency: { id: row.tenant.id, name: row.tenant.name, slug: row.tenant.slug },
    }));
  }

  async getMyProfile(userId: string, customerId: string): Promise<CustomerDetailResponse> {
    const customer = await this.requireOwnCustomer(userId, customerId);
    const documents = await this.repository.listDocuments(customer.id);
    return {
      ...toCustomerResponse(customer),
      documents: documents.map(toDocumentResponse),
      documentRequirements: computeDocumentRequirements(documents, new Date()),
    };
  }

  async updateMyProfile(userId: string, customerId: string, input: CustomerInput): Promise<CustomerResponse> {
    const customer = await this.requireOwnCustomer(userId, customerId);
    const parsed = parseCustomerPatch((input ?? {}) as Record<string, unknown>, new Date());
    if (parsed.failures.length > 0) {
      throw new ConflictException({
        code: parsed.failures[0].code,
        message: parsed.failures[0].message,
      });
    }
    const patch = parsed.value;
    if (patch.status !== undefined) {
      throw new ConflictException({
        code: CustomerErrorCode.CUSTOMER_STATUS_INVALID,
        message: 'Customers cannot change their own status.',
      });
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
    const updated = await this.repository.updateOwnCustomer(
      userId,
      customerId,
      patch as Prisma.CustomerUpdateInput,
    );
    if (!updated) {
      throw new NotFoundException({
        code: CustomerErrorCode.CUSTOMER_NOT_FOUND,
        message: 'Customer record not found.',
      });
    }
    return toCustomerResponse(updated);
  }

  // ── Own documents (07-A04) ───────────────────────────────────────────────

  async listMyDocuments(userId: string, customerId: string): Promise<DocumentResponse[]> {
    const customer = await this.requireOwnCustomer(userId, customerId);
    const documents = await this.repository.listDocuments(customer.id);
    return documents.map(toDocumentResponse);
  }

  async addMyDocument(userId: string, customerId: string, input: DocumentInput): Promise<DocumentResponse> {
    const customer = await this.requireOwnCustomer(userId, customerId);
    const parsed = parseDocumentPatch((input ?? {}) as Record<string, unknown>, new Date());
    if (parsed.value.type === undefined) {
      parsed.failures.push({
        field: 'type',
        code: CustomerErrorCode.DOCUMENT_TYPE_INVALID,
        message: 'type is required.',
      });
    }
    if (parsed.failures.length > 0) {
      throw new ConflictException({
        code: parsed.failures[0].code,
        message: parsed.failures[0].message,
      });
    }
    const type = parsed.value.type!;
    const existing = (await this.repository.listDocuments(customer.id)).find((d) => d.type === type);
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

  /**
   * Self-service edit: allowed while the document is not VERIFIED; a
   * rejected document returns to PENDING (resubmission, 07-A04).
   */
  async updateMyDocument(
    userId: string,
    customerId: string,
    documentId: string,
    input: DocumentInput,
  ): Promise<DocumentResponse> {
    const customer = await this.requireOwnCustomer(userId, customerId);
    const document = await this.requireDocument(customer.id, documentId);
    if (document.status === 'VERIFIED') {
      throw new ConflictException({
        code: CustomerErrorCode.DOCUMENT_VERIFIED_IMMUTABLE,
        message: 'Verified documents can only be changed by agency staff.',
      });
    }
    const parsed = parseDocumentPatch((input ?? {}) as Record<string, unknown>, new Date());
    if (parsed.failures.length > 0) {
      throw new ConflictException({
        code: parsed.failures[0].code,
        message: parsed.failures[0].message,
      });
    }
    const updated = await this.repository.updateDocument(customer.id, documentId, {
      ...parsed.value,
      status: 'PENDING',
    });
    if (!updated) {
      throw new NotFoundException({
        code: CustomerErrorCode.DOCUMENT_NOT_FOUND,
        message: 'Document not found.',
      });
    }
    return toDocumentResponse(updated);
  }

  // ── Favorites (07-A05) ───────────────────────────────────────────────────

  async listFavorites(userId: string): Promise<FavoriteItem[]> {
    const rows = await this.repository.listFavorites(userId);
    return rows.map((row) => ({
      vehicleId: row.vehicleId,
      createdAt: row.createdAt.toISOString(),
      vehicle: {
        id: row.vehicle.id,
        tenantId: row.vehicle.tenantId,
        make: row.vehicle.make,
        model: row.vehicle.model,
        year: row.vehicle.year,
        color: row.vehicle.color,
        categoryId: row.vehicle.categoryId,
      },
    }));
  }

  async addFavorite(userId: string, vehicleId: string): Promise<FavoriteItem> {
    await this.requireVehicle(vehicleId);
    try {
      const row = await this.repository.addFavorite(userId, vehicleId);
      return {
        vehicleId: row.vehicleId,
        createdAt: row.createdAt.toISOString(),
        vehicle: await this.vehicleSummary(vehicleId),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: CustomerErrorCode.FAVORITE_EXISTS,
          message: 'This vehicle is already in your favorites.',
        });
      }
      throw error;
    }
  }

  async removeFavorite(userId: string, vehicleId: string): Promise<{ removed: boolean }> {
    const removed = await this.repository.removeFavorite(userId, vehicleId);
    if (!removed) {
      throw new NotFoundException({
        code: CustomerErrorCode.FAVORITE_NOT_FOUND,
        message: 'This vehicle is not in your favorites.',
      });
    }
    return { removed: true };
  }

  // ── Recently viewed (07-A06) ─────────────────────────────────────────────

  async recordView(userId: string, input: RecentlyViewedInput): Promise<{ recorded: boolean }> {
    const vehicleId = typeof input?.vehicleId === 'string' ? input.vehicleId.trim() : '';
    if (vehicleId.length === 0) {
      throw new ConflictException({
        code: CustomerErrorCode.VEHICLE_NOT_FOUND,
        message: 'vehicleId is required.',
      });
    }
    await this.requireVehicle(vehicleId);
    await this.repository.recordView(userId, vehicleId, new Date());
    return { recorded: true };
  }

  async listRecentlyViewed(userId: string): Promise<RecentlyViewedItem[]> {
    const rows = await this.repository.listRecentlyViewed(userId);
    return rows.map((row) => ({
      vehicleId: row.vehicleId,
      viewedAt: row.viewedAt.toISOString(),
      createdAt: row.viewedAt.toISOString(),
      vehicle: {
        id: row.vehicle.id,
        tenantId: row.vehicle.tenantId,
        make: row.vehicle.make,
        model: row.vehicle.model,
        year: row.vehicle.year,
        color: row.vehicle.color,
        categoryId: row.vehicle.categoryId,
      },
    }));
  }

  async clearRecentlyViewed(userId: string): Promise<{ cleared: boolean }> {
    await this.repository.clearRecentlyViewed(userId);
    return { cleared: true };
  }

  // ── Search history (07-A07) ──────────────────────────────────────────────

  async recordSearch(userId: string, input: SearchHistoryInput): Promise<SearchHistoryResponse> {
    const criteria = input?.criteria;
    if (criteria === null || criteria === undefined || typeof criteria !== 'object' || Array.isArray(criteria)) {
      throw new ConflictException({
        code: CustomerErrorCode.SEARCH_CRITERIA_INVALID,
        message: 'criteria must be a JSON object snapshot of the search inputs.',
      });
    }
    const snapshot = normalizeCriteria(criteria as Record<string, unknown>);
    if (Object.keys(snapshot).length === 0) {
      throw new ConflictException({
        code: CustomerErrorCode.SEARCH_CRITERIA_INVALID,
        message: 'criteria must not be empty.',
      });
    }
    await this.repository.addSearchHistory(userId, snapshot);
    const rows = await this.repository.listSearchHistory(userId);
    const latest = rows[0];
    if (!latest) {
      throw new NotFoundException({
        code: CustomerErrorCode.SEARCH_CRITERIA_INVALID,
        message: 'Search history entry could not be recorded.',
      });
    }
    return {
      id: latest.id,
      criteria: latest.criteria as Record<string, unknown>,
      createdAt: latest.createdAt.toISOString(),
    };
  }

  async listSearchHistory(userId: string): Promise<SearchHistoryResponse[]> {
    const rows = await this.repository.listSearchHistory(userId);
    return rows.map((row) => ({
      id: row.id,
      criteria: row.criteria as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async clearSearchHistory(userId: string): Promise<{ cleared: boolean }> {
    await this.repository.clearSearchHistory(userId);
    return { cleared: true };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async requireOwnCustomer(userId: string, customerId: string): Promise<Customer> {
    const customer = await this.repository.findOwnCustomer(userId, customerId);
    if (!customer) {
      throw new NotFoundException({
        code: CustomerErrorCode.CUSTOMER_NOT_FOUND,
        message: 'Customer record not found.',
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

  private async requireVehicle(vehicleId: string): Promise<void> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException({
        code: CustomerErrorCode.VEHICLE_NOT_FOUND,
        message: 'Vehicle not found.',
      });
    }
  }

  private async vehicleSummary(vehicleId: string): Promise<FavoriteItem['vehicle']> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException({
        code: CustomerErrorCode.VEHICLE_NOT_FOUND,
        message: 'Vehicle not found.',
      });
    }
    return {
      id: vehicle.id,
      tenantId: vehicle.tenantId,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      categoryId: vehicle.categoryId,
    };
  }
}

/**
 * Search criteria snapshots are stored as plain data. Anything beyond a
 * bounded, JSON-safe object is rejected so history rows can never smuggle
 * executable or unbounded payloads (07-A07).
 */
function normalizeCriteria(criteria: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(criteria)) {
    if (key.length > 64 || typeof value === 'function' || value === undefined) {
      continue;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      snapshot[key] = value;
    } else if (typeof value === 'object') {
      snapshot[key] = JSON.parse(JSON.stringify(value)) as unknown;
    }
  }
  return snapshot;
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
