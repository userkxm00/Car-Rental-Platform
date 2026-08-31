import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUserId } from '../../authorization/guard/permission.guard';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import type { BookingRequestInput } from '../domain/booking-rules';
import { BookingsService, type BookingResponse } from '../application/bookings.service';

/**
 * Booking API (05-B03/B04/B05/B07).
 *
 * - POST /api/v1/agencies/:agencyId/bookings — create a booking (vehicle or
 *   category target). Availability is re-checked server-side; the booking
 *   starts DRAFT with an append-only history entry.
 * - POST /api/v1/agencies/:agencyId/bookings/:bookingId/hold — place the
 *   inventory hold through the commitment guard (DRAFT→HOLD, 05-B05).
 * - GET  /api/v1/agencies/:agencyId/bookings / :bookingId — tenant-scoped
 *   reads with the status history.
 *
 * All routes require an ACTIVE membership in the agency; creation requires
 * `booking.create`, reads `booking.read`. Clients can never set a status
 * directly — every transition is a named domain command (05-C).
 */
@Controller('agencies/:agencyId/bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CREATE)
  async createBooking(
    @Param('agencyId') agencyId: string,
    @AuthUserId() userId: string,
    @Body() body: BookingRequestInput,
  ): Promise<BookingResponse> {
    return this.service.createBooking(agencyId, userId, body ?? {});
  }

  @Post(':bookingId/hold')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CREATE)
  async holdBooking(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.placeBookingHold(agencyId, userId, bookingId);
  }

  /**
   * 05-C: named state-machine commands. Each endpoint carries exactly the
   * permission its transition requires (05-C12); the service enforces the
   * transition table — clients can never set a status directly.
   */
  @Post(':bookingId/request-confirmation')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CREATE)
  async requestConfirmation(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
    @Body() body: { customerId?: string; quoteId?: string },
  ): Promise<BookingResponse> {
    return this.service.requestConfirmation(agencyId, userId, bookingId, body ?? {});
  }

  @Post(':bookingId/confirm')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CONFIRM)
  async confirm(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.confirmBooking(agencyId, userId, bookingId);
  }

  @Post(':bookingId/ready')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CONFIRM)
  async markReady(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.markReady(agencyId, userId, bookingId);
  }

  @Post(':bookingId/check-out')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CONFIRM)
  async checkOut(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.checkOut(agencyId, userId, bookingId);
  }

  @Post(':bookingId/request-return')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_RETURN)
  async requestReturn(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.requestReturn(agencyId, userId, bookingId);
  }

  @Post(':bookingId/complete-return')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_RETURN)
  async completeReturn(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.completeReturn(agencyId, userId, bookingId);
  }

  @Post(':bookingId/open-settlement')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_RETURN)
  async openSettlement(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.openSettlement(agencyId, userId, bookingId);
  }

  @Post(':bookingId/complete')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_RETURN)
  async complete(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.completeBooking(agencyId, userId, bookingId);
  }

  @Post(':bookingId/cancel')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CANCEL)
  async cancel(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
    @Body() body: { reason?: string },
  ): Promise<BookingResponse> {
    return this.service.cancelBooking(agencyId, userId, bookingId, body?.reason ?? '');
  }

  @Post(':bookingId/reject')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CONFIRM)
  async reject(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
    @Body() body: { reason?: string },
  ): Promise<BookingResponse> {
    return this.service.rejectBooking(agencyId, userId, bookingId, body?.reason ?? '');
  }

  @Post(':bookingId/expire')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CANCEL)
  async expire(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<BookingResponse> {
    return this.service.expireBooking(agencyId, userId, bookingId);
  }

  @Post(':bookingId/no-show')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CONFIRM)
  async noShow(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
    @Body() body: { reason?: string },
  ): Promise<BookingResponse> {
    return this.service.markNoShow(agencyId, userId, bookingId, body?.reason ?? '');
  }

  @Get()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_READ)
  async listBookings(@Param('agencyId') agencyId: string): Promise<BookingResponse[]> {
    return this.service.listBookings(agencyId);
  }

  @Get(':bookingId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_READ)
  async getBooking(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<BookingResponse> {
    return this.service.getBooking(agencyId, bookingId);
  }
}
