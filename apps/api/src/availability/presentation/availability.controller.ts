import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import { LocationContextService } from '../application/location-context.service';
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
 * - GET  /agencies/:agencyId/availability/timeline — scheduler feed (04-D):
 *   vehicles with all commitments intersecting the window (vehicleId /
 *   branchId filters), each flagged `conflicting` from the shared overlap
 *   contract.
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
    private readonly locationContext: LocationContextService,
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
    const context = await this.locationContext.resolve(agencyId, { pickupBranchId, returnBranchId, deliveryZoneId });
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
    const context = await this.locationContext.resolve(agencyId, { pickupBranchId, returnBranchId, deliveryZoneId });
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
    const context = await this.locationContext.resolve(agencyId, { pickupBranchId, returnBranchId, deliveryZoneId });
    return this.service.categoryCapacity(agencyId, categoryId, interval, context);
  }

  /**
   * 04-D01…D05: scheduler timeline for the agency. Returns the vehicles
   * matching the optional vehicleId/branchId filters with every commitment
   * intersecting the window; conflicts are computed from the shared overlap
   * contract (04-D03).
   */
  @Get('timeline')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async timeline(
    @Param('agencyId') agencyId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('branchId') branchId?: string,
  ): Promise<unknown> {
    const interval = this.service.validateRequestInterval(start, end);
    return this.service.scheduleTimeline(agencyId, interval, { vehicleId, branchId });
  }

}
