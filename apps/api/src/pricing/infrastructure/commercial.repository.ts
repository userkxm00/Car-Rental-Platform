import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CommercialDiscountType,
  DepositPolicyType,
  ExtraPricingUnit,
  ExtraType,
  FeeRuleKind,
} from '@prisma/client';

/**
 * PHASE-06 / 06-C persistence: promotions (+eligibility scopes), coupons,
 * extras catalog, fee rules and deposit policies. Child-set replacement is
 * transactional; deactivation is PATCH (no hard deletes — price history
 * stays reconstructible).
 */

export interface PromotionRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  discountType: CommercialDiscountType;
  valueMinor: number;
  minDurationUnits: number | null;
  durationUnit: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }>;
}

export interface CouponRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  discountType: CommercialDiscountType;
  valueMinor: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtraRow {
  id: string;
  tenantId: string;
  key: string;
  type: ExtraType;
  name: string;
  pricingUnit: ExtraPricingUnit;
  amountMinor: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeRuleRow {
  id: string;
  tenantId: string;
  kind: FeeRuleKind;
  deliveryZoneId: string | null;
  branchId: string | null;
  baseMinor: number;
  perKmMinor: number | null;
  perOccurrenceMinor: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepositPolicyRow {
  id: string;
  tenantId: string;
  name: string;
  depositType: DepositPolicyType;
  valueMinor: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
}

@Injectable()
export class CommercialRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Promotions ────────────────────────────────────────────────────────

  async createPromotion(input: {
    tenantId: string;
    code: string;
    name: string;
    discountType: CommercialDiscountType;
    valueMinor: number;
    minDurationUnits: number | null;
    durationUnit: string | null;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    maxRedemptions: number | null;
    active: boolean;
    scopes: Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }>;
  }): Promise<PromotionRow> {
    const promotion = await this.prisma.$transaction(async (tx) => {
      const created = await tx.promotion.create({
        data: {
          tenantId: input.tenantId,
          code: input.code,
          name: input.name,
          discountType: input.discountType,
          valueMinor: input.valueMinor,
          minDurationUnits: input.minDurationUnits,
          durationUnit: input.durationUnit as never,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil,
          maxRedemptions: input.maxRedemptions,
          active: input.active,
        },
      });
      if (input.scopes.length > 0) {
        await tx.promotionScope.createMany({
          data: input.scopes.map((scope) => ({
            promotionId: created.id,
            vehicleId: scope.vehicleId,
            categoryId: scope.categoryId,
            branchId: scope.branchId,
          })),
        });
      }
      return tx.promotion.findUniqueOrThrow({
        where: { id: created.id },
        include: { scopes: true },
      });
    });
    return this.toPromotionRow(promotion);
  }

  async findPromotion(tenantId: string, promotionId: string): Promise<PromotionRow | null> {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id: promotionId, tenantId },
      include: { scopes: true },
    });
    return promotion ? this.toPromotionRow(promotion) : null;
  }

  async listPromotions(tenantId: string): Promise<PromotionRow[]> {
    const promotions = await this.prisma.promotion.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
      include: { scopes: true },
    });
    return promotions.map((promotion) => this.toPromotionRow(promotion));
  }

  async listActivePromotionCandidates(tenantId: string): Promise<PromotionRow[]> {
    const promotions = await this.prisma.promotion.findMany({
      where: { tenantId, active: true },
      include: { scopes: true },
    });
    return promotions.map((promotion) => this.toPromotionRow(promotion));
  }

  async updatePromotion(
    tenantId: string,
    promotionId: string,
    patch: {
      code?: string;
      name?: string;
      discountType?: CommercialDiscountType;
      valueMinor?: number;
      minDurationUnits?: number | null;
      durationUnit?: string | null;
      effectiveFrom?: Date;
      effectiveUntil?: Date | null;
      maxRedemptions?: number | null;
      active?: boolean;
    },
    replaceScopes?: Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }>,
  ): Promise<PromotionRow | null> {
    const promotion = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.promotion.updateMany({
        where: { id: promotionId, tenantId },
        data: {
          ...(patch.code !== undefined ? { code: patch.code } : {}),
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.discountType !== undefined ? { discountType: patch.discountType } : {}),
          ...(patch.valueMinor !== undefined ? { valueMinor: patch.valueMinor } : {}),
          ...(patch.minDurationUnits !== undefined ? { minDurationUnits: patch.minDurationUnits } : {}),
          ...(patch.durationUnit !== undefined ? { durationUnit: patch.durationUnit as never } : {}),
          ...(patch.effectiveFrom !== undefined ? { effectiveFrom: patch.effectiveFrom } : {}),
          ...(patch.effectiveUntil !== undefined ? { effectiveUntil: patch.effectiveUntil } : {}),
          ...(patch.maxRedemptions !== undefined ? { maxRedemptions: patch.maxRedemptions } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
      });
      if (updated.count !== 1) {
        return null;
      }
      if (replaceScopes !== undefined) {
        await tx.promotionScope.deleteMany({ where: { promotionId } });
        if (replaceScopes.length > 0) {
          await tx.promotionScope.createMany({
            data: replaceScopes.map((scope) => ({
              promotionId,
              vehicleId: scope.vehicleId,
              categoryId: scope.categoryId,
              branchId: scope.branchId,
            })),
          });
        }
      }
      return tx.promotion.findUniqueOrThrow({
        where: { id: promotionId },
        include: { scopes: true },
      });
    });
    return promotion ? this.toPromotionRow(promotion) : null;
  }

  // ── Coupons ───────────────────────────────────────────────────────────

  async createCoupon(input: {
    tenantId: string;
    code: string;
    name: string;
    discountType: CommercialDiscountType;
    valueMinor: number;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    maxUses: number | null;
    active: boolean;
  }): Promise<CouponRow> {
    const coupon = await this.prisma.coupon.create({
      data: { ...input },
    });
    return this.toCouponRow(coupon);
  }

  async findCoupon(tenantId: string, couponId: string): Promise<CouponRow | null> {
    const coupon = await this.prisma.coupon.findFirst({
      where: { id: couponId, tenantId },
    });
    return coupon ? this.toCouponRow(coupon) : null;
  }

  async findCouponByCode(tenantId: string, code: string): Promise<CouponRow | null> {
    const coupon = await this.prisma.coupon.findFirst({
      where: { tenantId, code: code.toUpperCase() },
    });
    return coupon ? this.toCouponRow(coupon) : null;
  }

  async listCoupons(tenantId: string): Promise<CouponRow[]> {
    const coupons = await this.prisma.coupon.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    });
    return coupons.map((coupon) => this.toCouponRow(coupon));
  }

  async updateCoupon(
    tenantId: string,
    couponId: string,
    patch: {
      code?: string;
      name?: string;
      discountType?: CommercialDiscountType;
      valueMinor?: number;
      effectiveFrom?: Date;
      effectiveUntil?: Date | null;
      maxUses?: number | null;
      active?: boolean;
    },
  ): Promise<CouponRow | null> {
    const updated = await this.prisma.coupon.updateMany({
      where: { id: couponId, tenantId },
      data: {
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.discountType !== undefined ? { discountType: patch.discountType } : {}),
        ...(patch.valueMinor !== undefined ? { valueMinor: patch.valueMinor } : {}),
        ...(patch.effectiveFrom !== undefined ? { effectiveFrom: patch.effectiveFrom } : {}),
        ...(patch.effectiveUntil !== undefined ? { effectiveUntil: patch.effectiveUntil } : {}),
        ...(patch.maxUses !== undefined ? { maxUses: patch.maxUses } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    if (updated.count !== 1) {
      return null;
    }
    return this.findCoupon(tenantId, couponId);
  }

  // ── Extras ────────────────────────────────────────────────────────────

  async createExtra(input: {
    tenantId: string;
    key: string;
    type: ExtraType;
    name: string;
    pricingUnit: ExtraPricingUnit;
    amountMinor: number;
    active: boolean;
  }): Promise<ExtraRow> {
    const extra = await this.prisma.extra.create({ data: input });
    return this.toExtraRow(extra);
  }

  async findExtra(tenantId: string, extraId: string): Promise<ExtraRow | null> {
    const extra = await this.prisma.extra.findFirst({ where: { id: extraId, tenantId } });
    return extra ? this.toExtraRow(extra) : null;
  }

  async listExtras(tenantId: string): Promise<ExtraRow[]> {
    const extras = await this.prisma.extra.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { key: 'asc' }],
    });
    return extras.map((extra) => this.toExtraRow(extra));
  }

  async updateExtra(
    tenantId: string,
    extraId: string,
    patch: {
      key?: string;
      type?: ExtraType;
      name?: string;
      pricingUnit?: ExtraPricingUnit;
      amountMinor?: number;
      active?: boolean;
    },
  ): Promise<ExtraRow | null> {
    const updated = await this.prisma.extra.updateMany({
      where: { id: extraId, tenantId },
      data: {
        ...(patch.key !== undefined ? { key: patch.key } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.pricingUnit !== undefined ? { pricingUnit: patch.pricingUnit } : {}),
        ...(patch.amountMinor !== undefined ? { amountMinor: patch.amountMinor } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    if (updated.count !== 1) {
      return null;
    }
    return this.findExtra(tenantId, extraId);
  }

  // ── Fee rules ─────────────────────────────────────────────────────────

  async createFeeRule(input: {
    tenantId: string;
    kind: FeeRuleKind;
    deliveryZoneId: string | null;
    branchId: string | null;
    baseMinor: number;
    perKmMinor: number | null;
    perOccurrenceMinor: number | null;
    active: boolean;
  }): Promise<FeeRuleRow> {
    const rule = await this.prisma.feeRule.create({ data: input });
    return this.toFeeRuleRow(rule);
  }

  async findFeeRule(tenantId: string, feeRuleId: string): Promise<FeeRuleRow | null> {
    const rule = await this.prisma.feeRule.findFirst({ where: { id: feeRuleId, tenantId } });
    return rule ? this.toFeeRuleRow(rule) : null;
  }

  async listFeeRules(tenantId: string): Promise<FeeRuleRow[]> {
    const rules = await this.prisma.feeRule.findMany({
      where: { tenantId },
      orderBy: [{ kind: 'asc' }, { active: 'desc' }],
    });
    return rules.map((rule) => this.toFeeRuleRow(rule));
  }

  async listActiveFeeRuleCandidates(tenantId: string): Promise<FeeRuleRow[]> {
    const rules = await this.prisma.feeRule.findMany({ where: { tenantId, active: true } });
    return rules.map((rule) => this.toFeeRuleRow(rule));
  }

  async updateFeeRule(
    tenantId: string,
    feeRuleId: string,
    patch: {
      kind?: FeeRuleKind;
      deliveryZoneId?: string | null;
      branchId?: string | null;
      baseMinor?: number;
      perKmMinor?: number | null;
      perOccurrenceMinor?: number | null;
      active?: boolean;
    },
  ): Promise<FeeRuleRow | null> {
    const updated = await this.prisma.feeRule.updateMany({
      where: { id: feeRuleId, tenantId },
      data: {
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.deliveryZoneId !== undefined ? { deliveryZoneId: patch.deliveryZoneId } : {}),
        ...(patch.branchId !== undefined ? { branchId: patch.branchId } : {}),
        ...(patch.baseMinor !== undefined ? { baseMinor: patch.baseMinor } : {}),
        ...(patch.perKmMinor !== undefined ? { perKmMinor: patch.perKmMinor } : {}),
        ...(patch.perOccurrenceMinor !== undefined ? { perOccurrenceMinor: patch.perOccurrenceMinor } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    if (updated.count !== 1) {
      return null;
    }
    return this.findFeeRule(tenantId, feeRuleId);
  }

  // ── Deposit policies ──────────────────────────────────────────────────

  async createDepositPolicy(input: {
    tenantId: string;
    name: string;
    depositType: DepositPolicyType;
    valueMinor: number;
    active: boolean;
    scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
  }): Promise<DepositPolicyRow> {
    const policy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.depositPolicy.create({
        data: {
          tenantId: input.tenantId,
          name: input.name,
          depositType: input.depositType,
          valueMinor: input.valueMinor,
          active: input.active,
        },
      });
      if (input.scopes.length > 0) {
        await tx.depositPolicyScope.createMany({
          data: input.scopes.map((scope) => ({
            depositPolicyId: created.id,
            vehicleId: scope.vehicleId,
            categoryId: scope.categoryId,
          })),
        });
      }
      return tx.depositPolicy.findUniqueOrThrow({
        where: { id: created.id },
        include: { scopes: true },
      });
    });
    return this.toDepositPolicyRow(policy);
  }

  async findDepositPolicy(tenantId: string, policyId: string): Promise<DepositPolicyRow | null> {
    const policy = await this.prisma.depositPolicy.findFirst({
      where: { id: policyId, tenantId },
      include: { scopes: true },
    });
    return policy ? this.toDepositPolicyRow(policy) : null;
  }

  async listDepositPolicies(tenantId: string): Promise<DepositPolicyRow[]> {
    const policies = await this.prisma.depositPolicy.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { scopes: true },
    });
    return policies.map((policy) => this.toDepositPolicyRow(policy));
  }

  async listActiveDepositPolicyCandidates(tenantId: string): Promise<DepositPolicyRow[]> {
    const policies = await this.prisma.depositPolicy.findMany({
      where: { tenantId, active: true },
      include: { scopes: true },
    });
    return policies.map((policy) => this.toDepositPolicyRow(policy));
  }

  async updateDepositPolicy(
    tenantId: string,
    policyId: string,
    patch: {
      name?: string;
      depositType?: DepositPolicyType;
      valueMinor?: number;
      active?: boolean;
    },
    replaceScopes?: Array<{ vehicleId: string | null; categoryId: string | null }>,
  ): Promise<DepositPolicyRow | null> {
    const policy = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.depositPolicy.updateMany({
        where: { id: policyId, tenantId },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.depositType !== undefined ? { depositType: patch.depositType } : {}),
          ...(patch.valueMinor !== undefined ? { valueMinor: patch.valueMinor } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
      });
      if (updated.count !== 1) {
        return null;
      }
      if (replaceScopes !== undefined) {
        await tx.depositPolicyScope.deleteMany({ where: { depositPolicyId: policyId } });
        if (replaceScopes.length > 0) {
          await tx.depositPolicyScope.createMany({
            data: replaceScopes.map((scope) => ({
              depositPolicyId: policyId,
              vehicleId: scope.vehicleId,
              categoryId: scope.categoryId,
            })),
          });
        }
      }
      return tx.depositPolicy.findUniqueOrThrow({
        where: { id: policyId },
        include: { scopes: true },
      });
    });
    return policy ? this.toDepositPolicyRow(policy) : null;
  }

  // ── Mapping ───────────────────────────────────────────────────────────

  private toPromotionRow(promotion: {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    discountType: CommercialDiscountType;
    valueMinor: number;
    minDurationUnits: number | null;
    durationUnit: string | null;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    maxRedemptions: number | null;
    redemptionsCount: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    scopes: Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }>;
  }): PromotionRow {
    return {
      id: promotion.id,
      tenantId: promotion.tenantId,
      code: promotion.code,
      name: promotion.name,
      discountType: promotion.discountType,
      valueMinor: promotion.valueMinor,
      minDurationUnits: promotion.minDurationUnits,
      durationUnit: promotion.durationUnit,
      effectiveFrom: promotion.effectiveFrom,
      effectiveUntil: promotion.effectiveUntil,
      maxRedemptions: promotion.maxRedemptions,
      redemptionsCount: promotion.redemptionsCount,
      active: promotion.active,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
      scopes: promotion.scopes.map((scope) => ({
        vehicleId: scope.vehicleId,
        categoryId: scope.categoryId,
        branchId: scope.branchId,
      })),
    };
  }

  private toCouponRow(coupon: {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    discountType: CommercialDiscountType;
    valueMinor: number;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    maxUses: number | null;
    usedCount: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): CouponRow {
    return {
      id: coupon.id,
      tenantId: coupon.tenantId,
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType,
      valueMinor: coupon.valueMinor,
      effectiveFrom: coupon.effectiveFrom,
      effectiveUntil: coupon.effectiveUntil,
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
      active: coupon.active,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }

  private toExtraRow(extra: {
    id: string;
    tenantId: string;
    key: string;
    type: ExtraType;
    name: string;
    pricingUnit: ExtraPricingUnit;
    amountMinor: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ExtraRow {
    return {
      id: extra.id,
      tenantId: extra.tenantId,
      key: extra.key,
      type: extra.type,
      name: extra.name,
      pricingUnit: extra.pricingUnit,
      amountMinor: extra.amountMinor,
      active: extra.active,
      createdAt: extra.createdAt,
      updatedAt: extra.updatedAt,
    };
  }

  private toFeeRuleRow(rule: {
    id: string;
    tenantId: string;
    kind: FeeRuleKind;
    deliveryZoneId: string | null;
    branchId: string | null;
    baseMinor: number;
    perKmMinor: number | null;
    perOccurrenceMinor: number | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): FeeRuleRow {
    return {
      id: rule.id,
      tenantId: rule.tenantId,
      kind: rule.kind,
      deliveryZoneId: rule.deliveryZoneId,
      branchId: rule.branchId,
      baseMinor: rule.baseMinor,
      perKmMinor: rule.perKmMinor,
      perOccurrenceMinor: rule.perOccurrenceMinor,
      active: rule.active,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private toDepositPolicyRow(policy: {
    id: string;
    tenantId: string;
    name: string;
    depositType: DepositPolicyType;
    valueMinor: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
  }): DepositPolicyRow {
    return {
      id: policy.id,
      tenantId: policy.tenantId,
      name: policy.name,
      depositType: policy.depositType,
      valueMinor: policy.valueMinor,
      active: policy.active,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      scopes: policy.scopes.map((scope) => ({
        vehicleId: scope.vehicleId,
        categoryId: scope.categoryId,
      })),
    };
  }
}
