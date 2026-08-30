import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import {
  CreateVehicleCommand,
  UpdateVehicleCommand,
  VehiclesService,
} from '../application/vehicles.service';
import { Vehicle } from '@prisma/client';

function toResponse(vehicle: Vehicle): unknown {
  return {
    id: vehicle.id,
    agencyId: vehicle.tenantId,
    categoryId: vehicle.categoryId,
    currentBranchId: vehicle.currentBranchId,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    plateNumber: vehicle.plateNumber,
    vin: vehicle.vin,
    color: vehicle.color,
    status: vehicle.status,
    acquisitionDate: vehicle.acquisitionDate
      ? vehicle.acquisitionDate.toISOString().slice(0, 10)
      : null,
    acquisitionCost: vehicle.acquisitionCost,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

const VEHICLE_STATUSES: readonly VehicleStatus[] = [
  'AVAILABLE',
  'RESERVED',
  'RENTED',
  'MAINTENANCE',
  'INSPECTION',
  'ARCHIVED',
];

/**
 * Vehicle detail/list/filter API (03-B07/08) with server-side authorization
 * (03-B09). All routes require the caller's own active membership in the
 * agency plus the relevant fleet permission.
 */
@Controller('agencies/:agencyId/vehicles')
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Get()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async list(
    @Param('agencyId') agencyId: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
  ): Promise<unknown> {
    if (status !== undefined && !(VEHICLE_STATUSES as readonly string[]).includes(status)) {
      return { vehicles: [] };
    }
    const vehicles = await this.service.list(agencyId, {
      categoryId,
      status: status as VehicleStatus | undefined,
      branchId,
      search,
    });
    return { vehicles: vehicles.map(toResponse) };
  }

  @Post()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_CREATE)
  async create(
    @Param('agencyId') agencyId: string,
    @Body() body: CreateVehicleCommand,
  ): Promise<unknown> {
    const vehicle = await this.service.create(agencyId, body ?? {});
    return toResponse(vehicle);
  }

  @Get(':vehicleId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async get(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
  ): Promise<unknown> {
    const vehicle = await this.service.get(agencyId, vehicleId);
    return toResponse(vehicle);
  }

  @Patch(':vehicleId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async update(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: UpdateVehicleCommand,
  ): Promise<unknown> {
    const vehicle = await this.service.update(agencyId, vehicleId, body ?? {});
    return toResponse(vehicle);
  }

  @Patch(':vehicleId/status')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async setStatus(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { status: VehicleStatus },
  ): Promise<unknown> {
    const vehicle = await this.service.setStatus(agencyId, vehicleId, body.status);
    return toResponse(vehicle);
  }

  @Patch(':vehicleId/branch')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async setBranch(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { branchId: string | null },
  ): Promise<unknown> {
    const vehicle = await this.service.setCurrentBranch(agencyId, vehicleId, body.branchId);
    return toResponse(vehicle);
  }

  @Post(':vehicleId/odometer')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async recordOdometer(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { odometerKm: number; fuelLevelPercent?: number },
  ): Promise<unknown> {
    await this.service.recordOdometer(agencyId, vehicleId, body.odometerKm, body.fuelLevelPercent);
    const readings = await this.service.listOdometer(agencyId, vehicleId);
    return { readings: readings.map((r) => ({ ...r, recordedAt: r.recordedAt.toISOString() })) };
  }

  @Get(':vehicleId/odometer')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async listOdometer(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
  ): Promise<unknown> {
    const readings = await this.service.listOdometer(agencyId, vehicleId);
    return { readings: readings.map((r) => ({ ...r, recordedAt: r.recordedAt.toISOString() })) };
  }
}
