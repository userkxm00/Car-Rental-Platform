import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthPrincipal } from '../../auth/auth.guard';
import { IdentityResolutionService } from '../../auth/application/identity-resolution.service';
import type { VerifiedPrincipal } from '../../auth/ports/auth-provider.port';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import type { QuoteRequestInput } from '../../quotes/domain/quote-contract';
import type { CustomerResponse } from '../../customers/domain/customer-contract';
import type { BookingResponse } from '../../bookings/application/bookings.service';
import { MePortalService } from '../application/me-portal.service';
import type { ContractSignatureInput } from '../../contracts/domain/contracts.contract';

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

  @Get('bookings/:bookingId/documents')
  async bookingChecklist(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('bookingId') bookingId: string,
  ): Promise<ReturnType<MePortalService['bookingChecklist']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.bookingChecklist(userId, bookingId);
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

  // ── 08-C: own contracts, receipts and generated documents ────────────────

  @Get('bookings/:bookingId/contracts')
  async bookingContracts(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('bookingId') bookingId: string,
  ): Promise<ReturnType<MePortalService['bookingContracts']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.bookingContracts(userId, bookingId);
  }

  @Get('contracts/:contractId')
  async getContract(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('contractId') contractId: string,
  ): Promise<ReturnType<MePortalService['getContract']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.getContract(userId, contractId);
  }

  @Post('contracts/:contractId/signature')
  @HttpCode(201)
  async signContract(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('contractId') contractId: string,
    @Body() body: ContractSignatureInput,
  ): Promise<ReturnType<MePortalService['signContract']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.signContract(userId, contractId, body ?? {});
  }

  @Get('bookings/:bookingId/receipts')
  async bookingReceipts(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('bookingId') bookingId: string,
  ): Promise<ReturnType<MePortalService['bookingReceipts']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.bookingReceipts(userId, bookingId);
  }

  @Get('receipts/:receiptId')
  async getReceipt(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('receiptId') receiptId: string,
  ): Promise<ReturnType<MePortalService['getReceipt']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.getReceipt(userId, receiptId);
  }

  @Get('documents/:documentId/url')
  async downloadDocument(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('documentId') documentId: string,
  ): Promise<ReturnType<MePortalService['downloadDocument']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.downloadDocument(userId, documentId);
  }

  @Get('bookings/:bookingId/payments')
  async bookingPayments(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('bookingId') bookingId: string,
  ): Promise<ReturnType<MePortalService['bookingPayments']>> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.bookingPayments(userId, bookingId);
  }
}
