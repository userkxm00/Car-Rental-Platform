import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RateDurationUnit } from '@prisma/client';

/**
 * PHASE-06 / 06-A07 persistence: rate plans with their applicability
 * scopes (06-A04). Scope replacement is transactional — a plan's targets
 * are always stored as a consistent set.
 */

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
      return tx.ratePlan.findUniqueOrThrow({
        where: { id: created.id },
        include: { scopes: true },
      });
    });
    return this.toRow(plan);
  }

  async findInTenant(tenantId: string, ratePlanId: string): Promise<RatePlanRow | null> {
    const plan = await this.prisma.ratePlan.findFirst({
      where: { id: ratePlanId, tenantId },
      include: { scopes: true },
    });
    return plan ? this.toRow(plan) : null;
  }

  async listInTenant(tenantId: string): Promise<RatePlanRow[]> {
    const plans = await this.prisma.ratePlan.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
      include: { scopes: true },
    });
    return plans.map((plan) => this.toRow(plan));
  }

  /** 06-B: active plans of a tenant with their scopes (engine candidates). */
  async listActiveCandidates(tenantId: string): Promise<RatePlanRow[]> {
    const plans = await this.prisma.ratePlan.findMany({
      where: { tenantId, active: true },
      include: { scopes: true },
    });
    return plans.map((plan) => this.toRow(plan));
  }

  async update(
    tenantId: string,
    ratePlanId: string,
    patch: RatePlanPatch,
    replaceScopes?: Array<{ vehicleId: string | null; categoryId: string | null }>,
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
      return tx.ratePlan.findUniqueOrThrow({
        where: { id: ratePlanId },
        include: { scopes: true },
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
    };
  }
}
