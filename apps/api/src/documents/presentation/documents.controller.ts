import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { Permission } from '../../authorization/permissions';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import { DocumentsService } from '../application/documents.service';
import type {
  DocumentChecklistResponse,
  DocumentPolicyInput,
  DocumentPolicyResponse,
} from '../domain/documents.contract';

/**
 * PHASE-08 / 08-A staff surface.
 *
 * - GET/PUT /api/agencies/:agencyId/document-policy — the agency's
 *   required-document policy (08-A02; one per agency).
 * - GET /api/agencies/:agencyId/bookings/:bookingId/documents — the
 *   booking document checklist with expiry evaluation (08-A04/08-A05).
 *
 * The customer document records themselves stay on the existing customer
 * surface (07-A04: uploads, metadata, verification).
 */
@Controller('agencies/:agencyId')
@UseGuards(RateLimitGuard)
@RateLimit({ windowMs: 60_000, max: 120 })
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get('document-policy')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_READ)
  async getPolicy(@Param('agencyId') agencyId: string): Promise<DocumentPolicyResponse> {
    return this.service.getPolicy(agencyId);
  }

  @Put('document-policy')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_MANAGE)
  async putPolicy(
    @Param('agencyId') agencyId: string,
    @Body() body: DocumentPolicyInput,
  ): Promise<DocumentPolicyResponse> {
    return this.service.upsertPolicy(agencyId, body ?? {});
  }

  @Get('bookings/:bookingId/documents')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.BOOKING_READ)
  async bookingChecklist(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<DocumentChecklistResponse> {
    return this.service.checklistForBooking(agencyId, bookingId);
  }
}
