import { Injectable } from '@nestjs/common';
import { Prisma, Vehicle, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface VehicleFilters {
  categoryId?: string;
  status?: VehicleStatus;
  branchId?: string;
  search?: string;
}

/**
 * Vehicle persistence (03-B01/03-B04/05/06).
 */
@Injectable()
export class VehicleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    tenantId: string;
    categoryId: string;
    currentBranchId?: string;
    make: string;
    model: string;
    year: number;
    plateNumber: string;
    vin?: string;
    color?: string;
    acquisitionDate?: Date;
    acquisitionCost?: number;
  }): Promise<Vehicle> {
    return this.prisma.vehicle.create({
      data: {
        tenantId: input.tenantId,
        categoryId: input.categoryId,
        currentBranchId: input.currentBranchId ?? null,
        make: input.make,
        model: input.model,
        year: input.year,
        plateNumber: input.plateNumber,
        vin: input.vin ?? null,
        color: input.color ?? null,
        status: 'AVAILABLE',
        acquisitionDate: input.acquisitionDate ?? null,
        acquisitionCost: input.acquisitionCost ?? null,
      },
    });
  }

  async findById(id: string): Promise<Vehicle | undefined> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    return vehicle ?? undefined;
  }

  async listForTenant(tenantId: string, filters: VehicleFilters): Promise<Vehicle[]> {
    const where: Prisma.VehicleWhereInput = { tenantId };
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.branchId) {
      where.currentBranchId = filters.branchId;
    }
    if (filters.search) {
      const search = filters.search.trim();
      if (search.length > 0) {
        where.OR = [
          { make: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
          { plateNumber: { contains: search, mode: 'insensitive' } },
          { vin: { contains: search, mode: 'insensitive' } },
        ];
      }
    }
    return this.prisma.vehicle.findMany({ where, orderBy: { make: 'asc' } });
  }

  async update(
    id: string,
    input: {
      make?: string;
      model?: string;
      year?: number;
      vin?: string | null;
      color?: string | null;
      acquisitionDate?: Date | null;
      acquisitionCost?: number | null;
    },
  ): Promise<Vehicle> {
    return this.prisma.vehicle.update({ where: { id }, data: input });
  }

  async setStatus(id: string, status: VehicleStatus): Promise<Vehicle> {
    return this.prisma.vehicle.update({ where: { id }, data: { status } });
  }

  async setCurrentBranch(id: string, branchId: string | null): Promise<Vehicle> {
    return this.prisma.vehicle.update({ where: { id }, data: { currentBranchId: branchId } });
  }

  async addOdometerReading(
    vehicleId: string,
    odometerKm: number,
    fuelLevelPercent?: number,
  ): Promise<void> {
    await this.prisma.odometerReading.create({
      data: { vehicleId, odometerKm, fuelLevelPercent: fuelLevelPercent ?? null },
    });
  }

  async latestOdometer(vehicleId: string): Promise<number | undefined> {
    const reading = await this.prisma.odometerReading.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
    });
    return reading?.odometerKm;
  }

  async listOdometer(
    vehicleId: string,
  ): Promise<Array<{ odometerKm: number; fuelLevelPercent: number | null; recordedAt: Date }>> {
    const readings = await this.prisma.odometerReading.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });
    return readings.map((reading) => ({
      odometerKm: reading.odometerKm,
      fuelLevelPercent: reading.fuelLevelPercent,
      recordedAt: reading.recordedAt,
    }));
  }
}
