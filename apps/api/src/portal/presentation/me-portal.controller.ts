import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthPrincipal } from '../../auth/auth.guard';
import { IdentityResolutionService } from '../../auth/application/identity-resolution.service';
import type { VerifiedPrincipal } from '../../auth/ports/auth-provider.port';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import type { QuoteRequestInput } from '../../quotes/domain/quote-contract';
import type { CustomerResponse } from '../../customers/domain/customer-contract';
import type { BookingResponse } from '../../bookings/application/bookings.service';
import { MePortalService } from '../application/me-portal.service';

/**
 * PHASE-07 / 07-E customer booking portal (me-surface).
 *
 * Authenticated non-member surface: the caller's identity always comes
 * from the verified token; every read/write is scoped to that identity
 * (own quotes, own customer records, own bookings). Agency references
 * arrive as public slugs and resolve through the marketplace
 * participating-agency rules.
 *
 * - POST /api/v1/me/quotes — request a quote from a public agency (07-E04).
 * - GET  /api/v1/me/quotes[/:quoteId] — my quotes (07-E04).
 * - POST /api/v1/me/customers/ensure — my customer record for an agency
 *   (07-E05; resolves-or-creates, idempotent).
 * - POST /api/v1/me/bookings — booking from an own quote (07-E08).
 * - GET  /api/v1/me/bookings[/:bookingId] — my reservations (07-E09).
 * - POST /api/v1/me/bookings/:bookingId/confirm — confirmation request
 *   (07-E08).
 * - POST /api/v1/me/bookings/:bookingId/cancel — customer cancellation
 *   (07-E10).
 */
@Controller('me')
@UseGuards(RateLimitGuard)
@RateLimit({ windowMs: 60_000, max: 60 })
export class MePortalController {
  constructor(
    private readonly service: MePortalService,
    private readonly identityResolution: IdentityResolutionService,
  ) {}

  // ── Quotes (07-E04) ──────────────────────────────────────────────────────

  @Post('quotes')
  @HttpCode(201)
  async createQuote(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Body() body: { agencySlug?: string } & QuoteRequestInput,
  ): Promise<ReturnType<MePortalService['createQuote']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.createQuote(userId, body.agencySlug ?? '', body ?? {});
  }

  @Get('quotes')
  async listQuotes(
    @AuthPrincipal() principal: VerifiedPrincipal,
  ): Promise<ReturnType<MePortalService['listQuotes']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.listQuotes(userId);
  }

  @Get('quotes/:quoteId')
  async getQuote(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('quoteId') quoteId: string,
  ): Promise<ReturnType<MePortalService['getQuote']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.getQuote(userId, quoteId);
  }

  // ── Customer record (07-E05) ─────────────────────────────────────────────

  @Post('customers/ensure')
  @HttpCode(200)
  async ensureCustomer(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Body() body: { agencySlug?: string },
  ): Promise<CustomerResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.ensureCustomer(userId, body.agencySlug ?? '');
  }

  // ── Bookings (07-E08/07-E09/07-E10) ──────────────────────────────────────

  @Post('bookings')
  @HttpCode(201)
  async createBooking(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Body() body: { quoteId?: string; idempotencyKey?: string },
  ): Promise<BookingResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.createBookingFromQuote(userId, body ?? {});
  }

  @Get('bookings')
  async listBookings(
    @AuthPrincipal() principal: VerifiedPrincipal,
  ): Promise<BookingResponse[]> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.listBookings(userId);
  }

  @Get('bookings/:bookingId')
  async getBooking(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('bookingId') bookingId: string,
  ): Promise<BookingResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.getBooking(userId, bookingId);
  }

  @Post('bookings/:bookingId/confirm')
  @HttpCode(200)
  async confirmBooking(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('bookingId') bookingId: string,
    @Body() body: { customerId?: string; quoteId?: string },
  ): Promise<BookingResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.confirmBooking(userId, bookingId, body ?? {});
  }

  @Post('bookings/:bookingId/cancel')
  @HttpCode(200)
  async cancelBooking(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('bookingId') bookingId: string,
    @Body() body: { reason?: string },
  ): Promise<BookingResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.cancelBooking(userId, bookingId, body?.reason ?? '');
  }
}
