import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import type { RatePlanRequestInput, RatePlanResponse } from '../domain/rate-plan-contract';
import { RatePlansService } from '../application/rate-plans.service';

/**
 * PHASE-06 / 06-A07: rate administration API.
 *
 * - POST   /api/v1/agencies/:agencyId/pricing/rate-plans
 * - GET    /api/v1/agencies/:agencyId/pricing/rate-plans[/:ratePlanId]
 * - PATCH  /api/v1/agencies/:agencyId/pricing/rate-plans/:ratePlanId
 *
 * Reads require `pricing.read`, writes `pricing.manage` (FINANCE can read
 * but never manage rates). All routes are agency-scoped; scope targets are
 * validated against tenant-owned vehicles/categories server-side.
 */
@Controller('agencies/:agencyId/pricing/rate-plans')
export class RatePlansController {
  constructor(private readonly service: RatePlansService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async create(
    @Param('agencyId') agencyId: string,
    @Body() body: RatePlanRequestInput,
  ): Promise<RatePlanResponse> {
    return this.service.createRatePlan(agencyId, body ?? {});
  }

  @Get()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async list(@Param('agencyId') agencyId: string): Promise<RatePlanResponse[]> {
    return this.service.listRatePlans(agencyId);
  }

  @Get(':ratePlanId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async get(
    @Param('agencyId') agencyId: string,
    @Param('ratePlanId') ratePlanId: string,
  ): Promise<RatePlanResponse> {
    return this.service.getRatePlan(agencyId, ratePlanId);
  }

  @Patch(':ratePlanId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async update(
    @Param('agencyId') agencyId: string,
    @Param('ratePlanId') ratePlanId: string,
    @Body() body: RatePlanRequestInput,
  ): Promise<RatePlanResponse> {
    return this.service.updateRatePlan(agencyId, ratePlanId, body ?? {});
  }
}
