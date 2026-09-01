import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RateDurationUnit } from '@prisma/client';
import { AvailabilityService } from '../../availability/application/availability.service';
import { parseUtcInstant } from '../../availability/domain/timezone-boundary';
import {
  MAX_BASE_RATE_MINOR,
  MAX_RATE_PLAN_NAME_LENGTH,
  MAX_RATE_PLAN_SCOPES,
  RATE_DURATION_UNITS,
  RATE_PLAN_CODE_PATTERN,
  RatePlanErrorCode,
  SUPPORTED_RATE_CURRENCIES,
  type RatePlanRequestInput,
  type RatePlanResponse,
  type RatePlanScopeInput,
} from '../domain/rate-plan-contract';
import {
  RatePlansRepository,
  type RatePlanPatch,
  type RatePlanRow,
} from '../infrastructure/rate-plans.repository';

/**
 * PHASE-06 / 06-A07: rate-plan administration.
 *
 * The service validates configuration at the boundary (code/name/currency/
 * duration-unit/integer-minor rate/window/precedence) and resolves every
 * scope target against tenant-owned records via the availability service
 * (06-A04). Overlapping windows and equal specificity are allowed to be
 * configured — the deterministic selection order (06-A06,
 * domain/rate-plan-selection.ts) resolves them at calculation time.
 * Deactivation is a PATCH (`active: false`) — plans are never hard-deleted
 * so price history stays reconstructible (docs/06-business-rules.md).
 */

export interface ValidatedRatePlan {
  code: string;
  name: string;
  currency: string;
  durationUnit: RateDurationUnit;
  baseRateMinor: number;
  precedence: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
}

@Injectable()
export class RatePlansService {
  constructor(
    private readonly repository: RatePlansRepository,
    private readonly availability: AvailabilityService,
  ) {}

  async createRatePlan(
    tenantId: string,
    input: RatePlanRequestInput,
  ): Promise<RatePlanResponse> {
    const validated = await this.validateInput(tenantId, input);
    try {
      const row = await this.repository.create({
        tenantId,
        ...validated,
      });
      return this.toResponse(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_CODE_TAKEN,
          message: 'A rate plan with this code already exists in the agency.',
        });
      }
      throw error;
    }
  }

  async getRatePlan(tenantId: string, ratePlanId: string): Promise<RatePlanResponse> {
    const row = await this.repository.findInTenant(tenantId, ratePlanId);
    if (!row) {
      throw new NotFoundException({
        code: RatePlanErrorCode.RATE_PLAN_NOT_FOUND,
        message: 'Rate plan not found in this agency.',
      });
    }
    return this.toResponse(row);
  }

  async listRatePlans(tenantId: string): Promise<RatePlanResponse[]> {
    const rows = await this.repository.listInTenant(tenantId);
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * PATCH semantics: provided fields are validated and applied; omitted
   * fields keep their current value; `effectiveUntil: null` clears the
   * window end; `scopes` (when provided) replaces the target set.
   */
  async updateRatePlan(
    tenantId: string,
    ratePlanId: string,
    patch: RatePlanRequestInput,
  ): Promise<RatePlanResponse> {
    const current = await this.repository.findInTenant(tenantId, ratePlanId);
    if (!current) {
      throw new NotFoundException({
        code: RatePlanErrorCode.RATE_PLAN_NOT_FOUND,
        message: 'Rate plan not found in this agency.',
      });
    }

    const merged: RatePlanRequestInput = {
      code: patch.code ?? current.code,
      name: patch.name ?? current.name,
      currency: patch.currency ?? current.currency,
      durationUnit: patch.durationUnit ?? current.durationUnit,
      baseRateMinor: patch.baseRateMinor ?? current.baseRateMinor,
      precedence: patch.precedence ?? current.precedence,
      effectiveFrom: patch.effectiveFrom ?? current.effectiveFrom.toISOString(),
      effectiveUntil:
        patch.effectiveUntil === undefined
          ? current.effectiveUntil?.toISOString() ?? null
          : patch.effectiveUntil,
      active: patch.active ?? current.active,
      scopes: patch.scopes,
    };
    const validated = await this.validateInput(tenantId, merged);

    const repoPatch: RatePlanPatch = {
      code: validated.code,
      name: validated.name,
      currency: validated.currency,
      durationUnit: validated.durationUnit,
      baseRateMinor: validated.baseRateMinor,
      precedence: validated.precedence,
      effectiveFrom: validated.effectiveFrom,
      effectiveUntil: validated.effectiveUntil,
      active: validated.active,
    };
    try {
      const row = await this.repository.update(
        tenantId,
        ratePlanId,
        repoPatch,
        patch.scopes === undefined ? undefined : validated.scopes,
      );
      if (!row) {
        throw new NotFoundException({
          code: RatePlanErrorCode.RATE_PLAN_NOT_FOUND,
          message: 'Rate plan not found in this agency.',
        });
      }
      return this.toResponse(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_CODE_TAKEN,
          message: 'A rate plan with this code already exists in the agency.',
        });
      }
      throw error;
    }
  }

  /** 06-A01…A06 boundary validation, shared by create and update. */
  private async validateInput(
    tenantId: string,
    input: RatePlanRequestInput,
  ): Promise<ValidatedRatePlan> {
    const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
    if (!RATE_PLAN_CODE_PATTERN.test(code)) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_CODE_INVALID,
        message:
          'code must be 2–32 characters of A–Z, 0–9, _ or - starting with a letter or digit.',
      });
    }
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < 1 || name.length > MAX_RATE_PLAN_NAME_LENGTH) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_NAME_INVALID,
        message: `name is required (1–${MAX_RATE_PLAN_NAME_LENGTH} characters).`,
      });
    }
    const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    if (!(SUPPORTED_RATE_CURRENCIES as readonly string[]).includes(currency)) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_CURRENCY_UNSUPPORTED,
        message: `currency must be one of ${SUPPORTED_RATE_CURRENCIES.join(', ')}.`,
      });
    }
    const durationUnit = (input.durationUnit ?? '').toUpperCase();
    if (!(RATE_DURATION_UNITS as readonly string[]).includes(durationUnit)) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_UNIT_INVALID,
        message: `durationUnit must be one of ${RATE_DURATION_UNITS.join(', ')}.`,
      });
    }
    if (
      typeof input.baseRateMinor !== 'number' ||
      !Number.isInteger(input.baseRateMinor) ||
      input.baseRateMinor < 0 ||
      input.baseRateMinor > MAX_BASE_RATE_MINOR
    ) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_RATE_INVALID,
        message: `baseRateMinor must be an integer between 0 and ${MAX_BASE_RATE_MINOR}.`,
      });
    }
    if (
      typeof input.precedence !== 'number' ||
      !Number.isInteger(input.precedence) ||
      input.precedence < 0
    ) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_PRECEDENCE_INVALID,
        message: 'precedence must be a non-negative integer.',
      });
    }
    const effectiveFrom = parseUtcInstant(input.effectiveFrom ?? '');
    const effectiveUntil =
      input.effectiveUntil === null || input.effectiveUntil === undefined
        ? null
        : parseUtcInstant(input.effectiveUntil);
    if (!effectiveFrom) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_WINDOW_INVALID,
        message: 'effectiveFrom must be a valid instant.',
      });
    }
    if (
      input.effectiveUntil !== null &&
      input.effectiveUntil !== undefined &&
      (!effectiveUntil || effectiveUntil.getTime() <= effectiveFrom.getTime())
    ) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_WINDOW_INVALID,
        message: 'effectiveUntil must be a valid instant strictly after effectiveFrom.',
      });
    }

    const scopes = await this.validateScopes(tenantId, input.scopes ?? []);
    return {
      code,
      name,
      currency,
      durationUnit: durationUnit as RateDurationUnit,
      baseRateMinor: input.baseRateMinor,
      precedence: input.precedence,
      effectiveFrom,
      effectiveUntil,
      active: input.active === undefined ? true : input.active === true,
      scopes,
    };
  }

  /** 06-A04: every scope targets exactly one tenant-owned record. */
  private async validateScopes(
    tenantId: string,
    scopes: RatePlanScopeInput[],
  ): Promise<Array<{ vehicleId: string | null; categoryId: string | null }>> {
    if (scopes.length > MAX_RATE_PLAN_SCOPES) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_SCOPE_EXCESSIVE,
        message: `At most ${MAX_RATE_PLAN_SCOPES} scope rows per rate plan.`,
      });
    }
    const vehicles = new Set<string>();
    const categories = new Set<string>();
    const resolved: Array<{ vehicleId: string | null; categoryId: string | null }> = [];

    for (const scope of scopes) {
      const hasVehicle = typeof scope.vehicleId === 'string' && scope.vehicleId.length > 0;
      const hasCategory = typeof scope.categoryId === 'string' && scope.categoryId.length > 0;
      if (hasVehicle === hasCategory) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_SCOPE_INVALID,
          message: 'Each scope row targets exactly one of vehicleId or categoryId.',
        });
      }
      if (hasVehicle) {
        if (vehicles.has(scope.vehicleId as string)) {
          throw new ConflictException({
            code: RatePlanErrorCode.RATE_PLAN_SCOPE_INVALID,
            message: 'Duplicate vehicle in scopes.',
          });
        }
        const vehicle = await this.availability.findVehicleInTenant(
          tenantId,
          scope.vehicleId as string,
        );
        if (!vehicle) {
          throw new ConflictException({
            code: RatePlanErrorCode.VEHICLE_NOT_FOUND,
            message: 'Vehicle not found in this agency.',
          });
        }
        vehicles.add(scope.vehicleId as string);
        resolved.push({ vehicleId: scope.vehicleId as string, categoryId: null });
      } else {
        if (categories.has(scope.categoryId as string)) {
          throw new ConflictException({
            code: RatePlanErrorCode.RATE_PLAN_SCOPE_INVALID,
            message: 'Duplicate category in scopes.',
          });
        }
        const category = await this.availability.findCategoryInTenant(
          tenantId,
          scope.categoryId as string,
        );
        if (!category) {
          throw new ConflictException({
            code: RatePlanErrorCode.CATEGORY_NOT_FOUND,
            message: 'Category not found in this agency.',
          });
        }
        if (!category.active) {
          throw new ConflictException({
            code: RatePlanErrorCode.CATEGORY_INACTIVE,
            message: 'Category is not active.',
          });
        }
        categories.add(scope.categoryId as string);
        resolved.push({ vehicleId: null, categoryId: scope.categoryId as string });
      }
    }
    return resolved;
  }

  private toResponse(row: RatePlanRow): RatePlanResponse {
    return {
      ratePlanId: row.id,
      code: row.code,
      name: row.name,
      currency: row.currency,
      durationUnit: row.durationUnit,
      baseRateMinor: row.baseRateMinor,
      precedence: row.precedence,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
      active: row.active,
      scopes: row.scopes.map((scope) => ({
        vehicleId: scope.vehicleId,
        categoryId: scope.categoryId,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
