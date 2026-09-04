import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUserId, PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { Permission } from '../../authorization/permissions';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import { PaymentsService } from '../application/payments.service';
import type {
  DepositHoldResponse,
  PaymentRecordInputBody,
  PaymentRecordResponse,
  PaymentSummaryResponse,
} from '../domain/payment-contract';

/**
 * PHASE-09 / 09-A staff surface: the booking payment intent
 * (09-A01/09-A04), manual payment records with evidence
 * (09-A02/09-A03/09-A05), the manual confirmation workflow (09-A08)
 * and the deposit hold lifecycle (09-A06).
 *
 * Every route is agency-scoped and permission-guarded; amounts always
 * trace to the immutable booking price snapshot and the confirmed
 * records — clients never supply totals.
 */
@Controller('agencies/:agencyId')
@UseGuards(RateLimitGuard)
@RateLimit({ windowMs: 60_000, max: 120 })
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get('bookings/:bookingId/payments')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PAYMENT_READ)
  async bookingPayments(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<PaymentSummaryResponse> {
    return this.service.getBookingPayments(agencyId, bookingId);
  }

  @Post('bookings/:bookingId/payments/records')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PAYMENT_RECORD)
  async recordPayment(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
    @Body() body: PaymentRecordInputBody,
  ): Promise<PaymentRecordResponse> {
    return this.service.recordPayment(agencyId, bookingId, userId, body ?? {});
  }

  @Post('bookings/:bookingId/payments/records/:recordId/confirm')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PAYMENT_RECORD)
  async confirmRecord(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @Param('recordId') recordId: string,
    @AuthUserId() userId: string,
  ): Promise<PaymentRecordResponse> {
    return this.service.confirmRecord(agencyId, bookingId, recordId, userId);
  }

  @Post('bookings/:bookingId/payments/records/:recordId/void')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PAYMENT_RECORD)
  async voidRecord(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @Param('recordId') recordId: string,
  ): Promise<PaymentRecordResponse> {
    return this.service.voidRecord(agencyId, bookingId, recordId);
  }

  @Post('bookings/:bookingId/deposit/release')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PAYMENT_RECORD)
  async releaseDeposit(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
    @Body() body: { note?: string },
  ): Promise<DepositHoldResponse> {
    const note =
      body?.note === undefined || body.note === null ? null : String(body.note).trim() || null;
    return this.service.releaseDeposit(agencyId, bookingId, userId, note);
  }
}
