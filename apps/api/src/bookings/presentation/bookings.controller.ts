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
