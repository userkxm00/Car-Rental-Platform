import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from '../application/availability.service';

/**
 * Availability API (04-C07) with the response contract (04-C08).
 *
 * Availability is its own computed resource (never a vehicle field), so the
 * endpoints live under `/agencies/:agencyId/availability/` — this also
 * avoids colliding with the fleet controller's `/vehicles/:vehicleId`
 * routes.
 *
 * Endpoints (agency staff; tenant scope + vehicle.read):
 * - GET  /agencies/:agencyId/availability/vehicles — bookable vehicles for
 *   the interval (categoryId/branchId filters).
 * - GET  /agencies/:agencyId/availability/vehicles/:vehicleId — structured
 *   available/reasons answer for one vehicle.
 * - GET  /agencies/:agencyId/availability/categories/:categoryId — capacity
 *   (eligible / committed / available).
 *
 * Interval params: `start`/`end` as ISO-8601 instants with an explicit
 * offset (or Z). Zone-less naive datetimes are rejected (04-A05).
 *
 * A successful availability read never guarantees a future reservation —
 * confirmation re-checks under the commitment guard (04-B).
 */
@Controller('agencies/:agencyId/availability')
export class AvailabilityController {
  constructor(
    private readonly service: AvailabilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('vehicles')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async listAvailable(
    @Param('agencyId') agencyId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('categoryId') categoryId?: string,
    @Query('branchId') branchId?: string,
    @Query('pickupBranchId') pickupBranchId?: string,
    @Query('returnBranchId') returnBranchId?: string,
    @Query('deliveryZoneId') deliveryZoneId?: string,
  ): Promise<unknown> {
    const interval = this.service.validateRequestInterval(start, end);
    const context = await this.resolveContext(agencyId, { pickupBranchId, returnBranchId, deliveryZoneId });
    return this.service.listAvailableVehicles(agencyId, interval, context, { categoryId, branchId });
  }

  @Get('vehicles/:vehicleId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async vehicleAvailability(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('pickupBranchId') pickupBranchId?: string,
    @Query('returnBranchId') returnBranchId?: string,
    @Query('deliveryZoneId') deliveryZoneId?: string,
  ): Promise<unknown> {
    const interval = this.service.validateRequestInterval(start, end);
    const context = await this.resolveContext(agencyId, { pickupBranchId, returnBranchId, deliveryZoneId });
    return this.service.vehicleAvailability(agencyId, vehicleId, interval, context);
  }

  @Get('categories/:categoryId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async categoryCapacity(
    @Param('agencyId') agencyId: string,
    @Param('categoryId') categoryId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('pickupBranchId') pickupBranchId?: string,
    @Query('returnBranchId') returnBranchId?: string,
    @Query('deliveryZoneId') deliveryZoneId?: string,
  ): Promise<unknown> {
    const interval = this.service.validateRequestInterval(start, end);
    const context = await this.resolveContext(agencyId, { pickupBranchId, returnBranchId, deliveryZoneId });
    return this.service.categoryCapacity(agencyId, categoryId, interval, context);
  }

  /**
   * 04-C06: validates the location context against tenant-owned records.
   * A referenced branch must belong to this agency; a referenced delivery
   * zone must belong to this agency and be active. Zone-based vehicle
   * eligibility itself is a spatial-phase concern — the context is carried
   * through and reported as a pending constraint, never silently applied.
   */
  private async resolveContext(
    agencyId: string,
    input: { pickupBranchId?: string; returnBranchId?: string; deliveryZoneId?: string },
  ): Promise<{ pickupBranchId?: string; returnBranchId?: string; deliveryZoneId?: string }> {
    const context = { ...input };
    for (const branchId of [input.pickupBranchId, input.returnBranchId]) {
      if (branchId) {
        const branch = await this.prisma.branch.findFirst({
          where: { id: branchId, tenantId: agencyId },
          select: { id: true },
        });
        if (!branch) {
          throw new NotFoundException({
            code: 'BRANCH_NOT_FOUND',
            message: 'Branch not found in this agency.',
          });
        }
      }
    }
    if (input.deliveryZoneId) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: { id: input.deliveryZoneId, tenantId: agencyId },
        select: { id: true, active: true },
      });
      if (!zone) {
        throw new NotFoundException({
          code: 'DELIVERY_ZONE_NOT_FOUND',
          message: 'Delivery zone not found in this agency.',
        });
      }
      if (!zone.active) {
        throw new NotFoundException({
          code: 'DELIVERY_ZONE_NOT_FOUND',
          message: 'Delivery zone is inactive.',
        });
      }
    }
    return context;
  }
}
