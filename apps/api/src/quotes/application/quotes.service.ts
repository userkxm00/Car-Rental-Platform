import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { AppEnv } from '@kavriqo/config';
import { APP_ENV } from '../../config/app-env.token';
import { AvailabilityService } from '../../availability/application/availability.service';
import { LocationContextService } from '../../availability/application/location-context.service';
import type { AvailabilityContext } from '../../availability/domain/availability-query';
import {
  QUOTE_CHANNELS,
  QuoteErrorCode,
  type QuoteAvailability,
  type QuoteChannel,
  type QuotePricingPayload,
  type QuoteRequestInput,
  type QuoteResponse,
  type ValidatedQuoteRequest,
} from '../domain/quote-contract';
import {
  QUOTE_PRICING_NOT_CONFIGURED_CODE,
  QUOTE_PRICING_PORT,
  type QuotePricingPort,
} from './ports/quote-pricing.port';
import { QuotesRepository, type QuoteRecordRow } from '../infrastructure/quotes.repository';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | undefined, label: string): string | null {
  if (value === undefined || value === '') {
    return null;
  }
  if (!UUID_SHAPE.test(value)) {
    throw new ConflictException({
      code: QuoteErrorCode.INVALID_INTERVAL,
      message: `${label} must be a valid identifier.`,
    });
  }
  return value;
}

/**
 * Quote/request use-case (05-A).
 *
 * Creates a calculated offer for the validated request: the interval is
 * checked at the 04-A boundary, the target (vehicle or category) must be
 * tenant-owned, the location context is tenant-validated, availability is
 * computed server-side (04-C), and the pricing slot is filled through the
 * 05-A04 port (null until PHASE-06). The quote is persisted as an immutable
 * record with an expiry (05-A05); reads re-surface it with an explicit
 * `expired` flag — an expired quote is never silently treated as current.
 *
 * A quote never reserves inventory: booking creation (05-B) re-checks under
 * the commitment guard (04-B).
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly locationContext: LocationContextService,
    private readonly repository: QuotesRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Optional()
    @Inject(QUOTE_PRICING_PORT)
    private readonly pricing?: QuotePricingPort,
  ) {}

  /** 05-A01/A02: boundary validation of the raw request. */
  validateRequest(input: QuoteRequestInput): ValidatedQuoteRequest {
    const { start, end } = this.availability.validateRequestInterval(input.start, input.end);

    if (start.getTime() <= Date.now()) {
      throw new ConflictException({
        code: QuoteErrorCode.INTERVAL_IN_PAST,
        message: 'Quote start must be in the future.',
      });
    }

    const vehicleId = optionalUuid(input.vehicleId, 'vehicleId');
    const categoryId = optionalUuid(input.categoryId, 'categoryId');
    if (vehicleId === null && categoryId === null) {
      throw new ConflictException({
        code: QuoteErrorCode.QUOTE_TARGET_REQUIRED,
        message: 'Exactly one of vehicleId or categoryId is required.',
      });
    }
    if (vehicleId !== null && categoryId !== null) {
      throw new ConflictException({
        code: QuoteErrorCode.QUOTE_TARGET_EXCLUSIVE,
        message: 'vehicleId and categoryId are mutually exclusive.',
      });
    }

    const channel = (input.channel ?? 'AGENCY_WEB') as QuoteChannel;
    if (!(QUOTE_CHANNELS as readonly string[]).includes(channel)) {
      throw new ConflictException({
        code: QuoteErrorCode.INVALID_CHANNEL,
        message: `channel must be one of ${QUOTE_CHANNELS.join(', ')}.`,
      });
    }

    return {
      channel,
      mode: vehicleId !== null ? 'VEHICLE' : 'CATEGORY',
      vehicleId,
      categoryId,
      start,
      end,
      pickupBranchId: optionalUuid(input.pickupBranchId, 'pickupBranchId'),
      returnBranchId: optionalUuid(input.returnBranchId, 'returnBranchId'),
      deliveryZoneId: optionalUuid(input.deliveryZoneId, 'deliveryZoneId'),
    };
  }

  /** 05-A02/A03/A04/A05: create the quote and persist the immutable record. */
  async createQuote(
    tenantId: string,
    createdBy: string | null,
    input: QuoteRequestInput,
  ): Promise<QuoteResponse> {
    const request = this.validateRequest(input);

    const context = await this.locationContext.resolve(tenantId, {
      pickupBranchId: request.pickupBranchId ?? undefined,
      returnBranchId: request.returnBranchId ?? undefined,
      deliveryZoneId: request.deliveryZoneId ?? undefined,
    });

    const { availability, vehicleCategoryId } = await this.computeAvailability(tenantId, request, context);

    // 05-A04: the pricing boundary. The pricing engine (PHASE-06 / 06-D)
    // computes the authoritative total through the port; when no rate
    // plan applies the provider signals PRICING_NOT_CONFIGURED and the
    // quote keeps `pricing: null` — consumers must treat an unpriced
    // quote as not bookable, never as a zero-price offer.
    let pricing: QuotePricingPayload | null = null;
    if (this.pricing) {
      try {
        pricing = await this.pricing.computeQuotePricing({
          tenantId,
          mode: request.mode,
          vehicleId: request.vehicleId ?? undefined,
          // 05-A04: vehicle-mode quotes carry the resolved category so
          // category-scoped rate plans match (07-E preview finding).
          categoryId: request.categoryId ?? vehicleCategoryId ?? undefined,
          start: request.start,
          end: request.end,
          pickupBranchId: request.pickupBranchId ?? undefined,
          returnBranchId: request.returnBranchId ?? undefined,
          deliveryZoneId: request.deliveryZoneId ?? undefined,
        });
      } catch (error) {
        if (!this.isPricingNotConfigured(error)) {
          throw error;
        }
      }
    }

    const expiresAt = new Date(Date.now() + this.env.QUOTE_TTL_MINUTES * 60_000);
    const row = await this.repository.create({
      tenantId,
      createdBy,
      request,
      availability,
      pricing,
      expiresAt,
    });
    return this.toResponse(row);
  }

  /** 07-E04: the caller's own quotes across agencies (most recent first). */
  async listQuotesByCreator(createdBy: string): Promise<QuoteResponse[]> {
    const rows = await this.repository.listByCreator(createdBy);
    return rows.map((row) => this.toResponse(row));
  }

  /** 07-E04: creator-scoped quote read — nobody else's quote is visible. */
  async getQuoteByCreator(createdBy: string, quoteId: string): Promise<QuoteResponse> {
    const row = await this.repository.findByCreator(createdBy, quoteId);
    if (!row) {
      throw new NotFoundException({
        code: QuoteErrorCode.QUOTE_NOT_FOUND,
        message: 'Quote not found.',
      });
    }
    return this.toResponse(row);
  }

  /** 05-A05: tenant-scoped read with an explicit expiry flag. */
  async getQuote(tenantId: string, quoteId: string): Promise<QuoteResponse> {
    const row = await this.repository.findInTenant(tenantId, quoteId);
    if (!row) {
      throw new NotFoundException({
        code: QuoteErrorCode.QUOTE_NOT_FOUND,
        message: 'Quote not found in this agency.',
      });
    }
    return this.toResponse(row);
  }

  /** 05-A02/A03: eligibility + server-computed availability (04-C reuse). */
  private async computeAvailability(
    tenantId: string,
    request: ValidatedQuoteRequest,
    context: AvailabilityContext,
  ): Promise<{ availability: QuoteAvailability; vehicleCategoryId: string | null }> {
    if (request.mode === 'VEHICLE') {
      // 404 VEHICLE_NOT_FOUND for unknown vehicles; archived vehicles are
      // reported unavailable with a structured reason (never an error).
      const result = await this.availability.vehicleAvailability(
        tenantId,
        request.vehicleId as string,
        { start: request.start, end: request.end },
        context,
      );
      return {
        availability: { mode: 'VEHICLE', available: result.available, reasons: result.reasons },
        vehicleCategoryId: result.categoryId,
      };
    }

    // Category eligibility: the category must belong to the agency and be
    // active; capacity is the available-count answer (04-C02).
    const category = await this.availability.findCategoryInTenant(
      tenantId,
      request.categoryId as string,
    );
    if (!category) {
      throw new NotFoundException({
        code: QuoteErrorCode.CATEGORY_NOT_FOUND,
        message: 'Category not found in this agency.',
      });
    }
    if (!category.active) {
      throw new NotFoundException({
        code: QuoteErrorCode.CATEGORY_INACTIVE,
        message: 'Category is not active.',
      });
    }
    const capacity = await this.availability.categoryCapacity(
      tenantId,
      request.categoryId as string,
      { start: request.start, end: request.end },
      context,
    );
    return {
      availability: {
        mode: 'CATEGORY',
        eligible: capacity.eligible,
        committed: capacity.committed,
        availableCount: capacity.available,
      },
      vehicleCategoryId: request.categoryId,
    };
  }

  private toResponse(row: QuoteRecordRow): QuoteResponse {
    return {
      quoteId: row.id,
      tenantId: row.tenantId,
      channel: row.channel as QuoteChannel,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      expired: row.expiresAt.getTime() <= Date.now(),
      request: {
        start: row.startsAt.toISOString(),
        end: row.endsAt.toISOString(),
        mode: row.inventoryMode,
        vehicleId: row.vehicleId,
        categoryId: row.categoryId,
        pickupBranchId: row.pickupBranchId,
        returnBranchId: row.returnBranchId,
        deliveryZoneId: row.deliveryZoneId,
      },
      availability: row.availabilityJson,
      pricing: row.pricingJson,
    };
  }

  /** The engine's stable "no pricing applies" signal (05-A04/06-D06). */
  private isPricingNotConfigured(error: unknown): boolean {
    return (
      error instanceof ConflictException &&
      (error.getResponse() as { code?: unknown }).code === QUOTE_PRICING_NOT_CONFIGURED_CODE
    );
  }
}
