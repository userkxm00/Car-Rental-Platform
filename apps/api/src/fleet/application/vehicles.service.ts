import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vehicle, VehicleStatus } from '@prisma/client';
import {
  FleetErrorCode,
  isValidModelYear,
  isValidPlate,
  isValidVin,
  MAKE_MODEL_MAX,
} from '../domain/fleet-rules';
import { CategoryRepository } from '../infrastructure/category.repository';
import { VehicleFilters, VehicleRepository } from '../infrastructure/vehicle.repository';
import { BranchesService } from '../../locations/application/branches.service';

export interface CreateVehicleCommand {
  categoryId: string;
  currentBranchId?: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  vin?: string;
  color?: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
}

export interface UpdateVehicleCommand {
  make?: string;
  model?: string;
  year?: number;
  vin?: string | null;
  color?: string | null;
  acquisitionDate?: string | null;
  acquisitionCost?: number | null;
}

const VEHICLE_TRANSITIONS: Readonly<Record<VehicleStatus, readonly VehicleStatus[]>> = {
  AVAILABLE: ['RESERVED', 'RENTED', 'MAINTENANCE', 'INSPECTION', 'ARCHIVED'],
  RESERVED: ['AVAILABLE', 'RENTED'],
  RENTED: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE'],
  INSPECTION: ['AVAILABLE'],
  ARCHIVED: [],
};

const FUEL_MIN = 0;
const FUEL_MAX = 100;
const COLOR_MAX = 40;

/**
 * Vehicle use-cases (03-B02…B06).
 *
 * Vehicle identity (plate/VIN/year) is validated server-side; plates are
 * unique per tenant; status changes follow the declared lifecycle and are
 * server-authoritative; current-branch assignment must reference the
 * tenant's own branch; odometer readings are monotonic.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly repository: VehicleRepository,
    private readonly categories: CategoryRepository,
    private readonly branches: BranchesService,
  ) {}

  async create(tenantId: string, command: CreateVehicleCommand): Promise<Vehicle> {
    const failures = this.validateVehicleFields(command);
    const category = await this.categories.findById(command.categoryId);
    if (!category || category.tenantId !== tenantId) {
      failures.push('categoryId: category not found in this agency');
    }
    if (command.currentBranchId) {
      try {
        await this.branches.getBranch(tenantId, command.currentBranchId);
      } catch {
        failures.push('currentBranchId: branch not found in this agency');
      }
    }
    if (failures.length > 0) {
      throw new ConflictException({
        code: FleetErrorCode.VEHICLE_VALIDATION_FAILED,
        message: 'Vehicle input contains invalid fields.',
        details: { failures },
      });
    }
    try {
      return await this.repository.create({
        tenantId,
        categoryId: command.categoryId,
        currentBranchId: command.currentBranchId,
        make: command.make.trim(),
        model: command.model.trim(),
        year: command.year,
        plateNumber: command.plateNumber.trim(),
        vin: command.vin,
        color: command.color,
        acquisitionDate: command.acquisitionDate ? new Date(command.acquisitionDate) : undefined,
        acquisitionCost: command.acquisitionCost,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: FleetErrorCode.VEHICLE_PLATE_TAKEN,
          message: 'This plate number is already registered in the agency.',
        });
      }
      throw error;
    }
  }

  async list(tenantId: string, filters: VehicleFilters): Promise<Vehicle[]> {
    return this.repository.listForTenant(tenantId, filters);
  }

  async get(tenantId: string, vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.repository.findById(vehicleId);
    if (!vehicle || vehicle.tenantId !== tenantId) {
      throw new NotFoundException({
        code: FleetErrorCode.VEHICLE_NOT_FOUND,
        message: 'Vehicle not found.',
      });
    }
    return vehicle;
  }

  async update(
    tenantId: string,
    vehicleId: string,
    command: UpdateVehicleCommand,
  ): Promise<Vehicle> {
    await this.get(tenantId, vehicleId);
    const failures = this.validateUpdateFields(command);
    if (failures.length > 0) {
      throw new ConflictException({
        code: FleetErrorCode.VEHICLE_VALIDATION_FAILED,
        message: 'Vehicle update contains invalid fields.',
        details: { failures },
      });
    }
    return this.repository.update(vehicleId, {
      ...(command.make !== undefined ? { make: command.make.trim() } : {}),
      ...(command.model !== undefined ? { model: command.model.trim() } : {}),
      ...(command.year !== undefined ? { year: command.year } : {}),
      ...(command.vin !== undefined ? { vin: command.vin } : {}),
      ...(command.color !== undefined ? { color: command.color } : {}),
      ...(command.acquisitionDate !== undefined
        ? { acquisitionDate: command.acquisitionDate ? new Date(command.acquisitionDate) : null }
        : {}),
      ...(command.acquisitionCost !== undefined
        ? { acquisitionCost: command.acquisitionCost }
        : {}),
    });
  }

  /** Server-authoritative status transitions (03-B03). */
  async setStatus(tenantId: string, vehicleId: string, to: VehicleStatus): Promise<Vehicle> {
    const vehicle = await this.get(tenantId, vehicleId);
    if (!VEHICLE_TRANSITIONS[vehicle.status].includes(to)) {
      throw new ConflictException({
        code: FleetErrorCode.INVALID_VEHICLE_STATUS_TRANSITION,
        message: `Vehicle status cannot change from ${vehicle.status} to ${to}.`,
      });
    }
    return this.repository.setStatus(vehicleId, to);
  }

  /** Current branch assignment (03-B04): tenant's own branches only. */
  async setCurrentBranch(
    tenantId: string,
    vehicleId: string,
    branchId: string | null,
  ): Promise<Vehicle> {
    await this.get(tenantId, vehicleId);
    if (branchId !== null) {
      try {
        await this.branches.getBranch(tenantId, branchId);
      } catch {
        throw new ConflictException({
          code: FleetErrorCode.VEHICLE_VALIDATION_FAILED,
          message: 'currentBranchId: branch not found in this agency',
        });
      }
    }
    return this.repository.setCurrentBranch(vehicleId, branchId);
  }

  /** Odometer/fuel reading (03-B05/06): km must not decrease. */
  async recordOdometer(
    tenantId: string,
    vehicleId: string,
    odometerKm: number,
    fuelLevelPercent?: number,
  ): Promise<void> {
    await this.get(tenantId, vehicleId);
    if (!Number.isInteger(odometerKm) || odometerKm < 0) {
      throw new ConflictException({
        code: FleetErrorCode.VEHICLE_VALIDATION_FAILED,
        message: 'odometerKm: must be a non-negative integer',
      });
    }
    if (
      fuelLevelPercent !== undefined &&
      (!Number.isInteger(fuelLevelPercent) ||
        fuelLevelPercent < FUEL_MIN ||
        fuelLevelPercent > FUEL_MAX)
    ) {
      throw new ConflictException({
        code: FleetErrorCode.VEHICLE_VALIDATION_FAILED,
        message: `fuelLevelPercent: must be an integer between ${FUEL_MIN} and ${FUEL_MAX}`,
      });
    }
    const latest = await this.repository.latestOdometer(vehicleId);
    if (latest !== undefined && odometerKm < latest) {
      throw new ConflictException({
        code: FleetErrorCode.VEHICLE_VALIDATION_FAILED,
        message: `odometerKm: must not decrease below the latest reading (${latest} km)`,
      });
    }
    await this.repository.addOdometerReading(vehicleId, odometerKm, fuelLevelPercent);
  }

  async listOdometer(
    tenantId: string,
    vehicleId: string,
  ): Promise<Array<{ odometerKm: number; fuelLevelPercent: number | null; recordedAt: Date }>> {
    await this.get(tenantId, vehicleId);
    return this.repository.listOdometer(vehicleId);
  }

  private validateVehicleFields(command: CreateVehicleCommand): string[] {
    const failures = this.validateUpdateFields(command);
    if (
      typeof command.make !== 'string' ||
      command.make.trim().length === 0 ||
      command.make.trim().length > MAKE_MODEL_MAX
    ) {
      failures.push(`make: must be 1-${MAKE_MODEL_MAX} characters`);
    }
    if (
      typeof command.model !== 'string' ||
      command.model.trim().length === 0 ||
      command.model.trim().length > MAKE_MODEL_MAX
    ) {
      failures.push(`model: must be 1-${MAKE_MODEL_MAX} characters`);
    }
    if (!isValidPlate(command.plateNumber)) {
      failures.push('plateNumber: must be 1-14 letters, digits or a single dash');
    }
    return failures;
  }

  private validateUpdateFields(command: CreateVehicleCommand | UpdateVehicleCommand): string[] {
    const failures: string[] = [];
    if ('year' in command && command.year !== undefined && !isValidModelYear(command.year)) {
      failures.push('year: must be a plausible model year');
    }
    if (
      'vin' in command &&
      command.vin !== undefined &&
      command.vin !== null &&
      !isValidVin(command.vin)
    ) {
      failures.push('vin: must be a 17-character VIN');
    }
    if (
      'color' in command &&
      command.color !== undefined &&
      command.color !== null &&
      command.color.length > COLOR_MAX
    ) {
      failures.push(`color: must be at most ${COLOR_MAX} characters`);
    }
    if (
      'acquisitionCost' in command &&
      command.acquisitionCost !== undefined &&
      command.acquisitionCost !== null &&
      (!Number.isInteger(command.acquisitionCost) || command.acquisitionCost < 0)
    ) {
      failures.push('acquisitionCost: must be a non-negative integer');
    }
    return failures;
  }
}
