import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { QuoteAvailability, QuotePricingPayload, ValidatedQuoteRequest } from '../domain/quote-contract';

/** Persisted quote row (05-A01/A05): immutable request context + answers. */
export interface QuoteRecordRow {
  id: string;
  tenantId: string;
  channel: string;
  inventoryMode: 'VEHICLE' | 'CATEGORY';
  vehicleId: string | null;
  categoryId: string | null;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  availabilityJson: QuoteAvailability;
  pricingJson: QuotePricingPayload | null;
  createdBy: string | null;
  createdAt: Date;
}

/**
 * Quote persistence (05-A): records are written once and never mutated —
 * the stored request context and availability answer remain the immutable
 * facts of the offer (docs/11 "Historical integrity").
 */
@Injectable()
export class QuotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    tenantId: string;
    createdBy: string | null;
    request: ValidatedQuoteRequest;
    availability: QuoteAvailability;
    pricing: QuotePricingPayload | null;
    expiresAt: Date;
  }): Promise<QuoteRecordRow> {
    const row = await this.prisma.quoteRecord.create({
      data: {
        tenantId: input.tenantId,
        channel: input.request.channel,
        inventoryMode: input.request.mode,
        vehicleId: input.request.vehicleId,
        categoryId: input.request.categoryId,
        pickupBranchId: input.request.pickupBranchId,
        returnBranchId: input.request.returnBranchId,
        deliveryZoneId: input.request.deliveryZoneId,
        startsAt: input.request.start,
        endsAt: input.request.end,
        expiresAt: input.expiresAt,
        availabilityJson: input.availability as never,
        pricingJson: input.pricing === null ? Prisma.JsonNull : (input.pricing as never),
        createdBy: input.createdBy,
      },
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      channel: row.channel,
      inventoryMode: row.inventoryMode,
      vehicleId: row.vehicleId,
      categoryId: row.categoryId,
      pickupBranchId: row.pickupBranchId,
      returnBranchId: row.returnBranchId,
      deliveryZoneId: row.deliveryZoneId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      expiresAt: row.expiresAt,
      availabilityJson: row.availabilityJson as unknown as QuoteAvailability,
      pricingJson: row.pricingJson as unknown as QuotePricingPayload | null,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }

  /** Tenant-scoped read — quotes are never visible across agencies. */
  async findInTenant(tenantId: string, quoteId: string): Promise<QuoteRecordRow | null> {
    const row = await this.prisma.quoteRecord.findFirst({
      where: { id: quoteId, tenantId },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      tenantId: row.tenantId,
      channel: row.channel,
      inventoryMode: row.inventoryMode,
      vehicleId: row.vehicleId,
      categoryId: row.categoryId,
      pickupBranchId: row.pickupBranchId,
      returnBranchId: row.returnBranchId,
      deliveryZoneId: row.deliveryZoneId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      expiresAt: row.expiresAt,
      availabilityJson: row.availabilityJson as unknown as QuoteAvailability,
      pricingJson: row.pricingJson as unknown as QuotePricingPayload | null,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }
}
