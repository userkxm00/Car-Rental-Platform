import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { Permission } from '../../authorization/permissions';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import { TemplatesService } from '../application/templates.service';
import type {
  TemplateAddVersionInput,
  TemplateCreateInput,
  TemplateListResponse,
  TemplatePreviewInput,
  TemplatePreviewResponse,
  TemplateResponse,
} from '../domain/templates.contract';

/**
 * PHASE-08 / 08-B staff surface: versioned contract templates.
 *
 * - GET/POST /api/agencies/:agencyId/document-templates
 * - GET      /api/agencies/:agencyId/document-templates/:templateId
 * - POST     /api/agencies/:agencyId/document-templates/:templateId/versions
 *   (append-only release — existing versions are never edited)
 * - POST     /api/agencies/:agencyId/document-templates/preview
 *   (08-B06 substitution + 08-B07 version selection, ar/fr/en)
 */
@Controller('agencies/:agencyId/document-templates')
@UseGuards(RateLimitGuard)
@RateLimit({ windowMs: 60_000, max: 120 })
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async list(@Param('agencyId') agencyId: string): Promise<TemplateListResponse> {
    return this.service.list(agencyId);
  }

  @Post()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_MANAGE)
  async create(
    @Param('agencyId') agencyId: string,
    @Body() body: TemplateCreateInput,
  ): Promise<TemplateResponse> {
    return this.service.create(agencyId, body ?? {});
  }

  @Get(':templateId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async get(
    @Param('agencyId') agencyId: string,
    @Param('templateId') templateId: string,
  ): Promise<TemplateResponse> {
    return this.service.get(agencyId, templateId);
  }

  @Post(':templateId/versions')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_MANAGE)
  async addVersion(
    @Param('agencyId') agencyId: string,
    @Param('templateId') templateId: string,
    @Body() body: TemplateAddVersionInput,
  ): Promise<TemplateResponse> {
    return this.service.addVersion(agencyId, templateId, body ?? {});
  }

  @Post('preview')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async preview(
    @Param('agencyId') agencyId: string,
    @Body() body: TemplatePreviewInput,
  ): Promise<TemplatePreviewResponse> {
    return this.service.preview(agencyId, body ?? {});
  }
}
