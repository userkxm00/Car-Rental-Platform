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
  type RatePlanAdjustmentInput,
  type RatePlanRequestInput,
  type RatePlanResponse,
  type RatePlanScopeInput,
  type RatePlanTierInput,
} from '../domain/rate-plan-contract';
import {
  MAX_ADJUSTMENT_AMOUNT_MINOR,
  MAX_ADJUSTMENT_PRECEDENCE,
  MAX_PERCENT_BASIS_POINTS,
  MAX_TIERS,
  MAX_TIER_RATE_MINOR,
  MAX_TIER_UNITS,
  MIN_TIER_UNITS,
  RateAdjustmentKind,
  RateAdjustmentType,
} from '../domain/time-rules';
import {
  RatePlansRepository,
  type RatePlanAdjustmentRow,
  type RatePlanPatch,
  type RatePlanRow,
  type RatePlanTierRow,
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
  tiers: RatePlanTierRow[];
  adjustments: RatePlanAdjustmentRow[];
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
      tiers: patch.tiers ?? current.tiers.map((tier) => ({
        upToUnits: tier.upToUnits,
        rateMinor: tier.rateMinor,
      })),
      adjustments: patch.adjustments ?? current.adjustments.map((adjustment) => ({
        kind: adjustment.kind,
        adjustmentType: adjustment.adjustmentType,
        windowStart: adjustment.windowStart?.toISOString() ?? null,
        windowEnd: adjustment.windowEnd?.toISOString() ?? null,
        date: adjustment.date,
        daysOfWeek: adjustment.daysOfWeek,
        valueMinor: adjustment.valueMinor,
        precedence: adjustment.precedence,
      })),
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
        patch.tiers === undefined ? undefined : validated.tiers,
        patch.adjustments === undefined ? undefined : validated.adjustments,
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
    const tiers = this.validateTiers(input.tiers ?? []);
    const adjustments = this.validateAdjustments(input.adjustments ?? []);
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
      tiers,
      adjustments,
    };
  }

  /** 06-B05: strictly increasing, unique, bounded duration ladder. */
  private validateTiers(tiers: RatePlanTierInput[]): RatePlanTierRow[] {
    if (tiers.length > MAX_TIERS) {
      throw new ConflictException({
        code: RatePlanErrorCode.RATE_PLAN_TIER_INVALID,
        message: `At most ${MAX_TIERS} tiers per rate plan.`,
      });
    }
    const seen = new Set<number | null>();
    let previous: number | null = null;
    const validated: RatePlanTierRow[] = [];
    for (const tier of tiers) {
      if (
        tier.rateMinor === undefined ||
        !Number.isInteger(tier.rateMinor) ||
        tier.rateMinor < 0 ||
        tier.rateMinor > MAX_TIER_RATE_MINOR
      ) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_TIER_INVALID,
          message: `tier.rateMinor must be an integer between 0 and ${MAX_TIER_RATE_MINOR}.`,
        });
      }
      const upToUnits =
        tier.upToUnits === null || tier.upToUnits === undefined
          ? null
          : tier.upToUnits;
      if (
        upToUnits !== null &&
        (!Number.isInteger(upToUnits) || upToUnits < MIN_TIER_UNITS || upToUnits > MAX_TIER_UNITS)
      ) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_TIER_INVALID,
          message: `tier.upToUnits must be null (open) or an integer in [${MIN_TIER_UNITS}, ${MAX_TIER_UNITS}].`,
        });
      }
      if (seen.has(upToUnits)) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_TIER_DUPLICATE,
          message: 'Tier unit bounds must be unique.',
        });
      }
      if (previous !== null && upToUnits !== null && upToUnits <= previous) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_TIER_ORDER_INVALID,
          message: 'Tier unit bounds must be strictly increasing.',
        });
      }
      seen.add(upToUnits);
      if (upToUnits !== null) {
        previous = upToUnits;
      }
      validated.push({ upToUnits, rateMinor: tier.rateMinor });
    }
    return validated;
  }

  /** 06-B06..B08: kind-specific shape, precedence uniqueness, bounded values. */
  private validateAdjustments(adjustments: RatePlanAdjustmentInput[]): RatePlanAdjustmentRow[] {
    const precedenceByKind = new Map<string, Set<number>>();
    const validated: RatePlanAdjustmentRow[] = [];
    for (const adjustment of adjustments) {
      const kind = (adjustment.kind ?? '').toUpperCase();
      if (!(Object.values(RateAdjustmentKind) as string[]).includes(kind)) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
          message: `adjustment.kind must be one of ${Object.values(RateAdjustmentKind).join(', ')}.`,
        });
      }
      const adjustmentType = (adjustment.adjustmentType ?? '').toUpperCase();
      if (!(Object.values(RateAdjustmentType) as string[]).includes(adjustmentType)) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
          message: `adjustment.adjustmentType must be one of ${Object.values(RateAdjustmentType).join(', ')}.`,
        });
      }
      if (
        adjustment.valueMinor === undefined ||
        !Number.isInteger(adjustment.valueMinor) ||
        adjustment.valueMinor < 0 ||
        adjustment.valueMinor > MAX_ADJUSTMENT_AMOUNT_MINOR
      ) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
          message: `adjustment.valueMinor must be an integer between 0 and ${MAX_ADJUSTMENT_AMOUNT_MINOR}.`,
        });
      }
      if (adjustmentType === 'PERCENT' && adjustment.valueMinor > MAX_PERCENT_BASIS_POINTS) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
          message: `PERCENT valueMinor is basis points (max ${MAX_PERCENT_BASIS_POINTS}).`,
        });
      }
      if (
        adjustment.precedence === undefined ||
        !Number.isInteger(adjustment.precedence) ||
        adjustment.precedence < 0 ||
        adjustment.precedence > MAX_ADJUSTMENT_PRECEDENCE
      ) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
          message: `adjustment.precedence must be an integer in [0, ${MAX_ADJUSTMENT_PRECEDENCE}].`,
        });
      }
      const precedences = precedenceByKind.get(kind) ?? new Set<number>();
      if (precedences.has(adjustment.precedence)) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_DUPLICATE,
          message: `precedence must be unique per kind (${kind}).`,
        });
      }
      precedences.add(adjustment.precedence);
      precedenceByKind.set(kind, precedences);

      // Kind-specific window/date shape.
      let windowStart: Date | null = null;
      let windowEnd: Date | null = null;
      let date: string | null = null;
      const daysOfWeek = Array.isArray(adjustment.daysOfWeek) ? [...adjustment.daysOfWeek] : [];
      if (daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new ConflictException({
          code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
          message: 'daysOfWeek entries must be integers 0 (Sunday) … 6 (Saturday).',
        });
      }
      if (kind === 'SEASONAL') {
        windowStart = parseUtcInstant(adjustment.windowStart ?? '');
        windowEnd =
          adjustment.windowEnd === null || adjustment.windowEnd === undefined
            ? null
            : parseUtcInstant(adjustment.windowEnd);
        if (!windowStart || (windowEnd !== null && windowEnd.getTime() <= windowStart.getTime())) {
          throw new ConflictException({
            code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_WINDOW_INVALID,
            message: 'SEASONAL requires windowStart and an optional windowEnd strictly after it.',
          });
        }
      } else if (kind === 'WEEKEND') {
        if (daysOfWeek.length === 0) {
          throw new ConflictException({
            code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
            message: 'WEEKEND requires at least one daysOfWeek entry.',
          });
        }
      } else {
        // HOLIDAY and SPECIAL_DATE are R1 plain calendar days.
        const rawDate = typeof adjustment.date === 'string' ? adjustment.date : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(new Date(`${rawDate}T00:00:00Z`).getTime())) {
          throw new ConflictException({
            code: RatePlanErrorCode.RATE_PLAN_ADJUSTMENT_INVALID,
            message: `${kind} requires a valid YYYY-MM-DD date.`,
          });
        }
        date = rawDate;
      }

      validated.push({
        kind: kind as RatePlanAdjustmentRow['kind'],
        adjustmentType: adjustmentType as RatePlanAdjustmentRow['adjustmentType'],
        windowStart,
        windowEnd,
        date,
        daysOfWeek,
        valueMinor: adjustment.valueMinor,
        precedence: adjustment.precedence,
      });
    }
    return validated;
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
      tiers: row.tiers.map((tier) => ({ upToUnits: tier.upToUnits, rateMinor: tier.rateMinor })),
      adjustments: row.adjustments.map((adjustment) => ({
        kind: adjustment.kind,
        adjustmentType: adjustment.adjustmentType,
        windowStart: adjustment.windowStart?.toISOString() ?? null,
        windowEnd: adjustment.windowEnd?.toISOString() ?? null,
        date: adjustment.date,
        daysOfWeek: adjustment.daysOfWeek,
        valueMinor: adjustment.valueMinor,
        precedence: adjustment.precedence,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
