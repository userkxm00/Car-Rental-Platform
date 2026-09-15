import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUserId, PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { Permission } from '../../authorization/permissions';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import { BillingService } from '../application/billing.service';
import type { InvoiceResponse, LedgerEntryResponse } from '../application/billing.service';

/**
 * PHASE-09 / 09-B staff surface: the append-only booking ledger
 * (09-B06) and the settlement invoice lifecycle (09-B02/09-B03).
 * Ledger rows are never written directly — they are emitted by the
 * 09-A payment confirmations/voids and by invoice issuance here.
 */
@Controller('agencies/:agencyId')
@UseGuards(RateLimitGuard)
@RateLimit({ windowMs: 60_000, max: 120 })
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('bookings/:bookingId/ledger')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BILLING_READ)
  async bookingLedger(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<LedgerEntryResponse[]> {
    return this.service.getBookingLedger(agencyId, bookingId);
  }

  @Get('bookings/:bookingId/invoices')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BILLING_READ)
  async bookingInvoices(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<InvoiceResponse[]> {
    return this.service.getBookingInvoices(agencyId, bookingId);
  }

  @Post('bookings/:bookingId/invoices')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BILLING_MANAGE)
  async issueInvoice(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<InvoiceResponse> {
    return this.service.issueInvoice(agencyId, bookingId, userId);
  }

  @Post('bookings/:bookingId/invoices/:invoiceId/void')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BILLING_MANAGE)
  async voidInvoice(
    @Param('agencyId') agencyId: string,
    @Param('invoiceId') invoiceId: string,
    @AuthUserId() userId: string,
  ): Promise<InvoiceResponse> {
    return this.service.voidInvoice(agencyId, invoiceId, userId);
  }
}
