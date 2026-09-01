import { Injectable } from '@nestjs/common';
import { Prisma, type Customer, type CustomerDocument, type Vehicle } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RECENTLY_VIEWED_CAP, SEARCH_HISTORY_CAP } from '../domain/customer-rules';

/**
 * Self-service persistence (07-A02/07-A03, 07-A05…A07).
 *
 * Reads/writes are scoped to the caller's resolved user id — never to a
 * client-supplied one. Own customer records resolve through the
 * `customers.userId` linkage, so a user can only ever reach records that
 * were explicitly linked to their platform account.
 */

export interface OwnCustomerWithAgency extends Customer {
  tenant: { id: string; name: string; slug: string };
}

export interface FavoriteVehicleSummary {
  vehicle: Pick<Vehicle, 'id' | 'tenantId' | 'make' | 'model' | 'year' | 'color' | 'categoryId'>;
  createdAt: Date;
  vehicleId: string;
}

export interface RecentlyViewedSummary {
  vehicle: Pick<Vehicle, 'id' | 'tenantId' | 'make' | 'model' | 'year' | 'color' | 'categoryId'>;
  viewedAt: Date;
  vehicleId: string;
}

const VEHICLE_SUMMARY = {
  id: true,
  tenantId: true,
  make: true,
  model: true,
  year: true,
  color: true,
  categoryId: true,
} satisfies Prisma.VehicleSelect;

@Injectable()
export class CustomerSelfRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Own customer records ─────────────────────────────────────────────────

  async listOwnCustomers(userId: string): Promise<OwnCustomerWithAgency[]> {
    return this.prisma.customer.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
  }

  async findOwnCustomer(userId: string, customerId: string): Promise<OwnCustomerWithAgency | undefined> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, userId },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    return customer ?? undefined;
  }

  async updateOwnCustomer(
    userId: string,
    customerId: string,
    patch: Prisma.CustomerUpdateInput,
  ): Promise<Customer | undefined> {
    const updated = await this.prisma.customer.updateMany({
      where: { id: customerId, userId },
      data: patch,
    });
    if (updated.count === 0) {
      return undefined;
    }
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, userId } });
    return customer ?? undefined;
  }

  // ── Own documents ────────────────────────────────────────────────────────

  async listDocuments(customerId: string): Promise<CustomerDocument[]> {
    return this.prisma.customerDocument.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findDocument(customerId: string, documentId: string): Promise<CustomerDocument | undefined> {
    const document = await this.prisma.customerDocument.findFirst({
      where: { id: documentId, customerId },
    });
    return document ?? undefined;
  }

  async createDocument(data: {
    customerId: string;
    type: CustomerDocument['type'];
    number: string | null;
    issueDate: Date | null;
    expiryDate: Date | null;
  }): Promise<CustomerDocument> {
    return this.prisma.customerDocument.create({ data });
  }

  async updateDocument(
    customerId: string,
    documentId: string,
    patch: {
      number?: string | null;
      issueDate?: Date | null;
      expiryDate?: Date | null;
      status?: CustomerDocument['status'];
    },
  ): Promise<CustomerDocument | undefined> {
    const updated = await this.prisma.customerDocument.updateMany({
      where: { id: documentId, customerId },
      data: patch,
    });
    if (updated.count === 0) {
      return undefined;
    }
    return this.findDocument(customerId, documentId);
  }

  // ── Favorites (07-A05) ───────────────────────────────────────────────────

  async listFavorites(userId: string): Promise<FavoriteVehicleSummary[]> {
    return this.prisma.customerFavorite.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { vehicleId: true, createdAt: true, vehicle: { select: VEHICLE_SUMMARY } },
    });
  }

  async addFavorite(userId: string, vehicleId: string): Promise<{ vehicleId: string; createdAt: Date }> {
    return this.prisma.customerFavorite.create({
      data: { userId, vehicleId },
      select: { vehicleId: true, createdAt: true },
    });
  }

  async removeFavorite(userId: string, vehicleId: string): Promise<boolean> {
    const result = await this.prisma.customerFavorite.deleteMany({
      where: { userId, vehicleId },
    });
    return result.count > 0;
  }

  // ── Recently viewed (07-A06) ─────────────────────────────────────────────

  async recordView(userId: string, vehicleId: string, viewedAt: Date): Promise<void> {
    await this.prisma.recentlyViewedVehicle.upsert({
      where: { userId_vehicleId: { userId, vehicleId } },
      update: { viewedAt },
      create: { userId, vehicleId, viewedAt },
    });
    await this.pruneRecentlyViewed(userId);
  }

  async pruneRecentlyViewed(userId: string): Promise<void> {
    const kept = await this.prisma.recentlyViewedVehicle.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      select: { id: true },
      skip: RECENTLY_VIEWED_CAP,
    });
    if (kept.length > 0) {
      await this.prisma.recentlyViewedVehicle.deleteMany({
        where: { id: { in: kept.map((row) => row.id) } },
      });
    }
  }

  async listRecentlyViewed(userId: string): Promise<RecentlyViewedSummary[]> {
    return this.prisma.recentlyViewedVehicle.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take: RECENTLY_VIEWED_CAP,
      select: { vehicleId: true, viewedAt: true, vehicle: { select: VEHICLE_SUMMARY } },
    });
  }

  async clearRecentlyViewed(userId: string): Promise<void> {
    await this.prisma.recentlyViewedVehicle.deleteMany({ where: { userId } });
  }

  // ── Search history (07-A07) ──────────────────────────────────────────────

  async addSearchHistory(userId: string, criteria: Record<string, unknown>): Promise<void> {
    await this.prisma.searchHistoryEntry.create({
      data: { userId, criteria: criteria as Prisma.InputJsonValue },
    });
    const kept = await this.prisma.searchHistoryEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      skip: SEARCH_HISTORY_CAP,
    });
    if (kept.length > 0) {
      await this.prisma.searchHistoryEntry.deleteMany({
        where: { id: { in: kept.map((row) => row.id) } },
      });
    }
  }

  async listSearchHistory(userId: string): Promise<Array<{ id: string; criteria: unknown; createdAt: Date }>> {
    return this.prisma.searchHistoryEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_HISTORY_CAP,
      select: { id: true, criteria: true, createdAt: true },
    });
  }

  async clearSearchHistory(userId: string): Promise<void> {
    await this.prisma.searchHistoryEntry.deleteMany({ where: { userId } });
  }
}
