import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, RateAdjustmentKind, RateAdjustmentType, RateDurationUnit } from '@prisma/client';

/**
 * PHASE-06 / 06-A07 + 06-B persistence: rate plans with their
 * applicability scopes (06-A04), duration tiers (06-B05) and time
 * adjustments (06-B06..B08). Child-set replacement is transactional — a
 * plan's targets, tiers and adjustments are always stored as consistent
 * sets.
 */

export interface RatePlanTierRow {
  upToUnits: number | null;
  rateMinor: number;
}

export interface RatePlanAdjustmentRow {
  kind: RateAdjustmentKind;
  adjustmentType: RateAdjustmentType;
  windowStart: Date | null;
  windowEnd: Date | null;
  date: string | null;
  daysOfWeek: number[];
  valueMinor: number;
  precedence: number;
}

export interface RatePlanRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  currency: string;
  durationUnit: RateDurationUnit;
  baseRateMinor: number;
  precedence: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
  tiers: RatePlanTierRow[];
  adjustments: RatePlanAdjustmentRow[];
}

export interface RatePlanCreateInput {
  tenantId: string;
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

export interface RatePlanPatch {
  code?: string;
  name?: string;
  currency?: string;
  durationUnit?: RateDurationUnit;
  baseRateMinor?: number;
  precedence?: number;
  effectiveFrom?: Date;
  effectiveUntil?: Date | null;
  active?: boolean;
}

@Injectable()
export class RatePlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: RatePlanCreateInput): Promise<RatePlanRow> {
    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ratePlan.create({
        data: {
          tenantId: input.tenantId,
          code: input.code,
          name: input.name,
          currency: input.currency,
          durationUnit: input.durationUnit,
          baseRateMinor: input.baseRateMinor,
          precedence: input.precedence,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil,
          active: input.active,
        },
      });
      if (input.scopes.length > 0) {
        await tx.ratePlanScope.createMany({
          data: input.scopes.map((scope) => ({
            ratePlanId: created.id,
            vehicleId: scope.vehicleId,
            categoryId: scope.categoryId,
          })),
        });
      }
      if (input.tiers.length > 0) {
        await tx.ratePlanTier.createMany({
          data: input.tiers.map((tier) => ({
            ratePlanId: created.id,
            upToUnits: tier.upToUnits,
            rateMinor: tier.rateMinor,
          })),
        });
      }
      if (input.adjustments.length > 0) {
        await tx.ratePlanAdjustment.createMany({
          data: input.adjustments.map((adjustment) => ({
            ratePlanId: created.id,
            kind: adjustment.kind,
            adjustmentType: adjustment.adjustmentType,
            windowStart: adjustment.windowStart,
            windowEnd: adjustment.windowEnd,
            date: adjustment.date ? new Date(adjustment.date) : null,
            daysOfWeek: adjustment.daysOfWeek,
            valueMinor: adjustment.valueMinor,
            precedence: adjustment.precedence,
          })),
        });
      }
      return tx.ratePlan.findUniqueOrThrow({
        where: { id: created.id },
        include: CHILDREN_INCLUDE,
      });
    });
    return this.toRow(plan);
  }

  async findInTenant(tenantId: string, ratePlanId: string): Promise<RatePlanRow | null> {
    const plan = await this.prisma.ratePlan.findFirst({
      where: { id: ratePlanId, tenantId },
      include: CHILDREN_INCLUDE,
    });
    return plan ? this.toRow(plan) : null;
  }

  async listInTenant(tenantId: string): Promise<RatePlanRow[]> {
    const plans = await this.prisma.ratePlan.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
      include: CHILDREN_INCLUDE,
    });
    return plans.map((plan) => this.toRow(plan));
  }

  /** 06-B: active plans of a tenant with their children (engine candidates). */
  async listActiveCandidates(tenantId: string): Promise<RatePlanRow[]> {
    const plans = await this.prisma.ratePlan.findMany({
      where: { tenantId, active: true },
      include: CHILDREN_INCLUDE,
    });
    return plans.map((plan) => this.toRow(plan));
  }

  async update(
    tenantId: string,
    ratePlanId: string,
    patch: RatePlanPatch,
    replaceScopes?: Array<{ vehicleId: string | null; categoryId: string | null }>,
    replaceTiers?: RatePlanTierRow[],
    replaceAdjustments?: RatePlanAdjustmentRow[],
  ): Promise<RatePlanRow | null> {
    const plan = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ratePlan.updateMany({
        where: { id: ratePlanId, tenantId },
        data: {
          ...(patch.code !== undefined ? { code: patch.code } : {}),
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
          ...(patch.durationUnit !== undefined ? { durationUnit: patch.durationUnit } : {}),
          ...(patch.baseRateMinor !== undefined ? { baseRateMinor: patch.baseRateMinor } : {}),
          ...(patch.precedence !== undefined ? { precedence: patch.precedence } : {}),
          ...(patch.effectiveFrom !== undefined ? { effectiveFrom: patch.effectiveFrom } : {}),
          ...(patch.effectiveUntil !== undefined ? { effectiveUntil: patch.effectiveUntil } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
      });
      if (updated.count !== 1) {
        return null;
      }
      if (replaceScopes !== undefined) {
        await tx.ratePlanScope.deleteMany({ where: { ratePlanId } });
        if (replaceScopes.length > 0) {
          await tx.ratePlanScope.createMany({
            data: replaceScopes.map((scope) => ({
              ratePlanId,
              vehicleId: scope.vehicleId,
              categoryId: scope.categoryId,
            })),
          });
        }
      }
      if (replaceTiers !== undefined) {
        await tx.ratePlanTier.deleteMany({ where: { ratePlanId } });
        if (replaceTiers.length > 0) {
          await tx.ratePlanTier.createMany({
            data: replaceTiers.map((tier) => ({
              ratePlanId,
              upToUnits: tier.upToUnits,
              rateMinor: tier.rateMinor,
            })),
          });
        }
      }
      if (replaceAdjustments !== undefined) {
        await tx.ratePlanAdjustment.deleteMany({ where: { ratePlanId } });
        if (replaceAdjustments.length > 0) {
          await tx.ratePlanAdjustment.createMany({
            data: replaceAdjustments.map((adjustment) => ({
              ratePlanId,
              kind: adjustment.kind,
              adjustmentType: adjustment.adjustmentType,
              windowStart: adjustment.windowStart,
              windowEnd: adjustment.windowEnd,
              date: adjustment.date ? new Date(adjustment.date) : null,
              daysOfWeek: adjustment.daysOfWeek,
              valueMinor: adjustment.valueMinor,
              precedence: adjustment.precedence,
            })),
          });
        }
      }
      return tx.ratePlan.findUniqueOrThrow({
        where: { id: ratePlanId },
        include: CHILDREN_INCLUDE,
      });
    });
    return plan ? this.toRow(plan) : null;
  }

  private toRow(plan: {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    currency: string;
    durationUnit: RateDurationUnit;
    baseRateMinor: number;
    precedence: number;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
    tiers: Array<{ upToUnits: number | null; rateMinor: number }>;
    adjustments: Array<{
      kind: RateAdjustmentKind;
      adjustmentType: RateAdjustmentType;
      windowStart: Date | null;
      windowEnd: Date | null;
      date: Date | null;
      daysOfWeek: number[];
      valueMinor: number;
      precedence: number;
    }>;
  }): RatePlanRow {
    return {
      id: plan.id,
      tenantId: plan.tenantId,
      code: plan.code,
      name: plan.name,
      currency: plan.currency,
      durationUnit: plan.durationUnit,
      baseRateMinor: plan.baseRateMinor,
      precedence: plan.precedence,
      effectiveFrom: plan.effectiveFrom,
      effectiveUntil: plan.effectiveUntil,
      active: plan.active,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      scopes: plan.scopes.map((scope) => ({
        vehicleId: scope.vehicleId,
        categoryId: scope.categoryId,
      })),
      tiers: plan.tiers.map((tier) => ({ upToUnits: tier.upToUnits, rateMinor: tier.rateMinor })),
      adjustments: plan.adjustments.map((adjustment) => ({
        kind: adjustment.kind,
        adjustmentType: adjustment.adjustmentType,
        windowStart: adjustment.windowStart,
        windowEnd: adjustment.windowEnd,
        date: adjustment.date ? localDayKeyOf(adjustment.date) : null,
        daysOfWeek: adjustment.daysOfWeek,
        valueMinor: adjustment.valueMinor,
        precedence: adjustment.precedence,
      })),
    };
  }
}

/** DATE columns come back at UTC midnight — render the plain day key. */
function localDayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const CHILDREN_INCLUDE = {
  scopes: true,
  tiers: true,
  adjustments: true,
} satisfies Prisma.RatePlanInclude;
