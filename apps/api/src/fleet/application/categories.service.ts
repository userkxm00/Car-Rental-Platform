import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DOORS_MAX,
  DOORS_MIN,
  DESCRIPTION_MAX,
  FleetErrorCode,
  FUEL_TYPES,
  isValidCategoryCode,
  LUGGAGE_MAX,
  LUGGAGE_MIN,
  NAME_MAX,
  SEATS_MAX,
  SEATS_MIN,
  TRANSMISSION_TYPES,
} from '../domain/fleet-rules';
import { FeatureKey, isFeatureKey } from '../domain/feature-catalog';
import { CategoryRepository, CategoryRow } from '../infrastructure/category.repository';

export interface CreateCategoryCommand {
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
  features?: FeatureKey[];
}

export interface UpdateCategoryCommand {
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
  features?: FeatureKey[];
}

/**
 * Vehicle category use-cases (03-A04).
 *
 * Categories are tenant-owned; every operation is scoped by the caller's
 * verified agency (guards at the HTTP layer). Localization fields cover
 * ar/fr/en (03-A06); features are validated against the versioned catalog
 * (03-A03).
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly repository: CategoryRepository) {}

  async create(tenantId: string, command: CreateCategoryCommand): Promise<CategoryRow> {
    this.validateCategoryFields(command);
    const features = this.validateFeatures(command.features);
    try {
      return await this.repository.create({
        tenantId,
        name: command.name.trim(),
        code: command.code,
        nameAr: command.nameAr,
        nameFr: command.nameFr,
        description: command.description,
        descriptionAr: command.descriptionAr,
        descriptionFr: command.descriptionFr,
        transmission: command.transmission,
        fuelType: command.fuelType,
        seats: command.seats,
        doors: command.doors,
        luggageCapacity: command.luggageCapacity,
        features,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: FleetErrorCode.CATEGORY_CODE_TAKEN,
          message: 'This category code is already taken within the agency.',
        });
      }
      throw error;
    }
  }

  async list(tenantId: string, activeOnly: boolean): Promise<CategoryRow[]> {
    return this.repository.listForTenant(tenantId, activeOnly);
  }

  async get(tenantId: string, categoryId: string): Promise<CategoryRow> {
    const category = await this.repository.findById(categoryId);
    if (!category || category.tenantId !== tenantId) {
      throw new NotFoundException({
        code: FleetErrorCode.CATEGORY_NOT_FOUND,
        message: 'Category not found.',
      });
    }
    return category;
  }

  async update(
    tenantId: string,
    categoryId: string,
    command: UpdateCategoryCommand,
  ): Promise<CategoryRow> {
    await this.get(tenantId, categoryId);
    const failures = this.validateUpdateFields(command);
    const features =
      command.features === undefined ? undefined : this.validateFeatures(command.features);
    if (failures.length > 0) {
      throw new ConflictException({
        code: FleetErrorCode.CATEGORY_VALIDATION_FAILED,
        message: 'Category update contains invalid fields.',
        details: { failures },
      });
    }
    const { features: _ignored, ...fields } = command;
    const updated = await this.repository.update(categoryId, fields);
    return features === undefined ? updated : this.repository.replaceFeatures(categoryId, features);
  }

  async setActive(tenantId: string, categoryId: string, active: boolean): Promise<CategoryRow> {
    await this.get(tenantId, categoryId);
    return this.repository.setActive(categoryId, active);
  }

  private validateFeatures(features: FeatureKey[] | undefined): FeatureKey[] {
    const list = features ?? [];
    const invalid = list.filter((key) => !isFeatureKey(key));
    if (invalid.length > 0) {
      throw new ConflictException({
        code: FleetErrorCode.CATEGORY_VALIDATION_FAILED,
        message: `Unknown feature key(s): ${invalid.join(', ')}.`,
      });
    }
    if (new Set(list).size !== list.length) {
      throw new ConflictException({
        code: FleetErrorCode.CATEGORY_VALIDATION_FAILED,
        message: 'Duplicate feature keys are not allowed.',
      });
    }
    return list;
  }

  private validateCategoryFields(command: CreateCategoryCommand): void {
    const failures = this.validateUpdateFields(command);
    if (typeof command.name !== 'string' || command.name.trim().length === 0) {
      failures.push('name: must be a non-empty string');
    }
    if (!isValidCategoryCode(command.code)) {
      failures.push('code: must be 2-24 uppercase letters, digits or hyphens');
    }
    if (failures.length > 0) {
      throw new ConflictException({
        code: FleetErrorCode.CATEGORY_VALIDATION_FAILED,
        message: 'Category input contains invalid fields.',
        details: { failures },
      });
    }
  }

  private validateUpdateFields(command: Omit<UpdateCategoryCommand, 'features'>): string[] {
    const failures: string[] = [];
    for (const [label, value, max] of [
      ['name', command.name, NAME_MAX],
      ['nameAr', command.nameAr, NAME_MAX],
      ['nameFr', command.nameFr, NAME_MAX],
    ] as const) {
      if (value !== undefined && value !== null && value.trim().length > max) {
        failures.push(`${label}: must be at most ${max} characters`);
      }
    }
    for (const [label, value] of [
      ['description', command.description],
      ['descriptionAr', command.descriptionAr],
      ['descriptionFr', command.descriptionFr],
    ] as const) {
      if (value !== undefined && value !== null && value.length > DESCRIPTION_MAX) {
        failures.push(`${label}: must be at most ${DESCRIPTION_MAX} characters`);
      }
    }
    if (
      command.transmission !== undefined &&
      command.transmission !== null &&
      !(TRANSMISSION_TYPES as readonly string[]).includes(command.transmission)
    ) {
      failures.push(`transmission: must be one of ${TRANSMISSION_TYPES.join(', ')}`);
    }
    if (
      command.fuelType !== undefined &&
      command.fuelType !== null &&
      !(FUEL_TYPES as readonly string[]).includes(command.fuelType)
    ) {
      failures.push(`fuelType: must be one of ${FUEL_TYPES.join(', ')}`);
    }
    if (
      command.seats !== undefined &&
      command.seats !== null &&
      (command.seats < SEATS_MIN || command.seats > SEATS_MAX)
    ) {
      failures.push(`seats: must be between ${SEATS_MIN} and ${SEATS_MAX}`);
    }
    if (
      command.doors !== undefined &&
      command.doors !== null &&
      (command.doors < DOORS_MIN || command.doors > DOORS_MAX)
    ) {
      failures.push(`doors: must be between ${DOORS_MIN} and ${DOORS_MAX}`);
    }
    if (
      command.luggageCapacity !== undefined &&
      command.luggageCapacity !== null &&
      (command.luggageCapacity < LUGGAGE_MIN || command.luggageCapacity > LUGGAGE_MAX)
    ) {
      failures.push(`luggageCapacity: must be between ${LUGGAGE_MIN} and ${LUGGAGE_MAX}`);
    }
    return failures;
  }
}
