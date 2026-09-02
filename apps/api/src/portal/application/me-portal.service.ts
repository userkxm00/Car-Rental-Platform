import { ConflictException, Injectable } from '@nestjs/common';
import { AgencyProfilesService } from '../../marketplace/application/agency-profiles.service';
import { BookingsService } from '../../bookings/application/bookings.service';
import type { BookingResponse } from '../../bookings/application/bookings.service';
import { QuotesService } from '../../quotes/application/quotes.service';
import type { QuoteResponse } from '../../quotes/domain/quote-contract';
import { QuoteErrorCode } from '../../quotes/domain/quote-contract';
import type { QuoteRequestInput } from '../../quotes/domain/quote-contract';
import { CustomerSelfService } from '../../customers/application/customer-self.service';
import type { CustomerResponse } from '../../customers/domain/customer-contract';

/**
 * PHASE-07 / 07-E customer booking portal (me-surface use-cases).
 *
 * Every entry point resolves the caller from the verified principal
 * (never from client input). Agency references arrive as public slugs and
 * resolve through the marketplace participating-agency rules, so hidden or
 * non-participating agencies are unreachable even with a valid token.
 *
 * - 07-E04: quotes are created for, listed and read by their creator only.
 * - 07-E05: customer records are resolved-or-created per agency.
 * - 07-E08: booking creation from an own quote; confirmation requests.
 * - 07-E09/07-E10: own reservations readable and cancellable, with the
 *   CUSTOMER initiator recorded in the audit history.
 */
@Injectable()
export class MePortalService {
  constructor(
    private readonly profiles: AgencyProfilesService,
    private readonly quotes: QuotesService,
    private readonly bookings: BookingsService,
    private readonly customers: CustomerSelfService,
  ) {}

  /** 07-E04: request a quote against a public agency slug (MARKETPLACE channel). */
  async createQuote(userId: string, agencySlug: string, input: QuoteRequestInput): Promise<QuoteResponse> {
    const profile = await this.profiles.getProfile(agencySlug);
    return this.quotes.createQuote(profile.agency.id, userId, { ...input, channel: 'MARKETPLACE' });
  }

  /** 07-E04: the caller's own quotes across agencies. */
  async listQuotes(userId: string): Promise<QuoteResponse[]> {
    return this.quotes.listQuotesByCreator(userId);
  }

  /** 07-E04: own quote review — nobody else's quote is visible. */
  async getQuote(userId: string, quoteId: string): Promise<QuoteResponse> {
    return this.quotes.getQuoteByCreator(userId, quoteId);
  }

  /** 07-E05: resolve-or-create the caller's customer record for one agency. */
  async ensureCustomer(userId: string, agencySlug: string): Promise<CustomerResponse> {
    const profile = await this.profiles.getProfile(agencySlug);
    return this.customers.ensureCustomerForAgency(userId, profile.agency.id);
  }

  /**
   * 07-E08: turn an own, unexpired quote into a DRAFT booking. The quote's
   * tenant scope is derived server-side from the quote record — the client
   * can never name an agency here. Booking creation re-checks availability
   * under the commitment guard (05-B), so a stale quote cannot hold an
   * unavailable vehicle.
   */
  async createBookingFromQuote(
    userId: string,
    body: { quoteId?: string; idempotencyKey?: string },
  ): Promise<BookingResponse> {
    const quote = await this.quotes.getQuoteByCreator(userId, body.quoteId ?? '');
    if (quote.expired) {
      throw new ConflictException({
        code: QuoteErrorCode.QUOTE_EXPIRED,
        message: 'This quote has expired and cannot be booked.',
      });
    }
    return this.bookings.createBooking(
      quote.tenantId,
      userId,
      {
        channel: 'MARKETPLACE',
        vehicleId: quote.request.vehicleId ?? undefined,
        categoryId: quote.request.categoryId ?? undefined,
        start: quote.request.start,
        end: quote.request.end,
        pickupBranchId: quote.request.pickupBranchId ?? undefined,
        returnBranchId: quote.request.returnBranchId ?? undefined,
        deliveryZoneId: quote.request.deliveryZoneId ?? undefined,
      },
      body.idempotencyKey,
    );
  }

  /** 07-E08: confirmation request scoped to the caller's own booking. */
  async confirmBooking(
    userId: string,
    bookingId: string,
    body: { customerId?: string; quoteId?: string },
  ): Promise<BookingResponse> {
    const booking = await this.bookings.getBookingForUser(userId, bookingId);
    return this.bookings.requestConfirmation(booking.tenantId, userId, bookingId, body ?? {});
  }

  /** 07-E09: the caller's own reservations across agencies. */
  async listBookings(userId: string): Promise<BookingResponse[]> {
    return this.bookings.listBookingsForUser(userId);
  }

  /** 07-E09: own reservation detail. */
  async getBooking(userId: string, bookingId: string): Promise<BookingResponse> {
    return this.bookings.getBookingForUser(userId, bookingId);
  }

  /** 07-E10: customer-initiated cancellation (CUSTOMER initiator audited). */
  async cancelBooking(userId: string, bookingId: string, reason: string): Promise<BookingResponse> {
    return this.bookings.cancelBookingForUser(userId, bookingId, reason);
  }
}
