import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUserId } from '../../authorization/guard/permission.guard';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import type { QuoteRequestInput, QuoteResponse } from '../domain/quote-contract';
import { QuotesService } from '../application/quotes.service';

/**
 * Quote API (05-A01/A06).
 *
 * - POST /api/v1/agencies/:agencyId/quotes — create a calculated offer for
 *   the validated request (vehicle or category target, interval, locations).
 *   Server-computed availability travels in the response; pricing is null
 *   until the pricing engine (PHASE-06) registers a provider.
 * - GET  /api/v1/agencies/:agencyId/quotes/:quoteId — tenant-scoped read
 *   with an explicit `expired` flag (05-A05).
 *
 * All routes require an ACTIVE membership in the agency; quoting requires
 * `booking.create`, reading `booking.read`. A quote never reserves
 * inventory — booking creation (05-B) re-checks under the commitment guard.
 */
@Controller('agencies/:agencyId/quotes')
export class QuotesController {
  constructor(private readonly service: QuotesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_CREATE)
  async createQuote(
    @Param('agencyId') agencyId: string,
    @AuthUserId() userId: string,
    @Body() body: QuoteRequestInput,
  ): Promise<QuoteResponse> {
    return this.service.createQuote(agencyId, userId, body ?? {});
  }

  @Get(':quoteId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_READ)
  async getQuote(
    @Param('agencyId') agencyId: string,
    @Param('quoteId') quoteId: string,
  ): Promise<QuoteResponse> {
    return this.service.getQuote(agencyId, quoteId);
  }
}
