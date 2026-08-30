import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureKey } from '../domain/feature-catalog';

export interface CategoryRow {
  id: string;
  tenantId: string;
  name: string;
  nameAr: string | null;
  nameFr: string | null;
  code: string;
  description: string | null;
  descriptionAr: string | null;
  descriptionFr: string | null;
  transmission: string | null;
  fuelType: string | null;
  seats: number | null;
  doors: number | null;
  luggageCapacity: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  features: string[];
}

type CategoryPayload = Prisma.VehicleCategoryGetPayload<{ include: { features: true } }>;

/**
 * Vehicle category persistence (03-A01/A02/A03/A06).
 */
@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    tenantId: string;
    name: string;
    code: string;
    nameAr?: string;
    nameFr?: string;
    description?: string;
    descriptionAr?: string;
    descriptionFr?: string;
    transmission?: string;
    fuelType?: string;
    seats?: number;
    doors?: number;
    luggageCapacity?: number;
    active?: boolean;
    features: FeatureKey[];
  }): Promise<CategoryRow> {
    const category = await this.prisma.vehicleCategory.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        nameAr: input.nameAr ?? null,
        nameFr: input.nameFr ?? null,
        code: input.code,
        description: input.description ?? null,
        descriptionAr: input.descriptionAr ?? null,
        descriptionFr: input.descriptionFr ?? null,
        transmission: input.transmission ?? null,
        fuelType: input.fuelType ?? null,
        seats: input.seats ?? null,
        doors: input.doors ?? null,
        luggageCapacity: input.luggageCapacity ?? null,
        active: input.active ?? true,
        features: { create: input.features.map((featureKey) => ({ featureKey })) },
      },
      include: { features: true },
    });
    return toRow(category);
  }

  async findById(id: string): Promise<CategoryRow | undefined> {
    const category = await this.prisma.vehicleCategory.findUnique({
      where: { id },
      include: { features: true },
    });
    return category ? toRow(category) : undefined;
  }

  async listForTenant(tenantId: string, activeOnly: boolean): Promise<CategoryRow[]> {
    const categories = await this.prisma.vehicleCategory.findMany({
      where: { tenantId, ...(activeOnly ? { active: true } : {}) },
      include: { features: true },
      orderBy: { code: 'asc' },
    });
    return categories.map(toRow);
  }

  async update(
    id: string,
    input: {
      name?: string;
      nameAr?: string | null;
      nameFr?: string | null;
      description?: string | null;
      descriptionAr?: string | null;
      descriptionFr?: string | null;
      transmission?: string | null;
      fuelType?: string | null;
      seats?: number | null;
      doors?: number | null;
      luggageCapacity?: number | null;
    },
  ): Promise<CategoryRow> {
    const category = await this.prisma.vehicleCategory.update({
      where: { id },
      data: input,
      include: { features: true },
    });
    return toRow(category);
  }

  async setActive(id: string, active: boolean): Promise<CategoryRow> {
    const category = await this.prisma.vehicleCategory.update({
      where: { id },
      data: { active },
      include: { features: true },
    });
    return toRow(category);
  }

  async replaceFeatures(id: string, features: FeatureKey[]): Promise<CategoryRow> {
    await this.prisma.$transaction([
      this.prisma.categoryFeature.deleteMany({ where: { categoryId: id } }),
      this.prisma.categoryFeature.createMany({
        data: features.map((featureKey) => ({ categoryId: id, featureKey })),
      }),
    ]);
    const category = await this.prisma.vehicleCategory.findUniqueOrThrow({
      where: { id },
      include: { features: true },
    });
    return toRow(category);
  }
}

function toRow(category: CategoryPayload): CategoryRow {
  return {
    id: category.id,
    tenantId: category.tenantId,
    name: category.name,
    nameAr: category.nameAr,
    nameFr: category.nameFr,
    code: category.code,
    description: category.description,
    descriptionAr: category.descriptionAr,
    descriptionFr: category.descriptionFr,
    transmission: category.transmission,
    fuelType: category.fuelType,
    seats: category.seats,
    doors: category.doors,
    luggageCapacity: category.luggageCapacity,
    active: category.active,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    features: category.features.map((f) => f.featureKey),
  };
}
