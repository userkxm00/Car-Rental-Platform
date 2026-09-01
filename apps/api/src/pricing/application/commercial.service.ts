import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CommercialDiscountType,
  DepositPolicyType,
  ExtraPricingUnit,
  ExtraType,
  FeeRuleKind,
} from '@prisma/client';
import { AvailabilityService } from '../../availability/application/availability.service';
import { parseUtcInstant } from '../../availability/domain/timezone-boundary';
import { BranchesService } from '../../locations/application/branches.service';
import { DeliveryZonesService } from '../../locations/application/delivery-zones.service';
import {
  COMMERCIAL_CODE_PATTERN,
  CommercialErrorCode,
  type CommercialErrorCodeValue,
  MAX_COMMERCIAL_NAME_LENGTH,
  type CouponRequestInput,
  type CouponResponse,
  type DepositPolicyRequestInput,
  type DepositPolicyResponse,
  type DepositPolicyScopeInput,
  type ExtraRequestInput,
  type ExtraResponse,
  type FeeRuleRequestInput,
  type FeeRuleResponse,
  type PromotionRequestInput,
  type PromotionResponse,
  type PromotionScopeInput,
} from '../domain/commercial-contract';
import {
  EXTRA_PRICING_UNITS,
  EXTRA_TYPES,
  FeeRuleKind as FeeRuleKindDomain,
  MAX_DISCOUNT_BASIS_POINTS,
  MAX_DISCOUNT_MINOR,
  MAX_EXTRA_AMOUNT_MINOR,
  MAX_REDEMPTIONS,
  MAX_SCOPE_ROWS,
} from '../domain/commercial-rules';
import { RATE_DURATION_UNITS } from '../domain/rate-plan-contract';
import {
  CommercialRepository,
  type CouponRow,
  type DepositPolicyRow,
  type ExtraRow,
  type FeeRuleRow,
  type PromotionRow,
} from '../infrastructure/commercial.repository';

/**
 * PHASE-06 / 06-C: commercial-adjustment administration (promotions,
 * coupons, extras catalog, fee rules, deposit policies) with boundary
 * validation and tenant-owned scope targets. Calculation/selection
 * semantics live in `domain/commercial-rules.ts` and are consumed by the
 * engine (06-D).
 */

@Injectable()
export class CommercialService {
  constructor(
    private readonly repository: CommercialRepository,
    private readonly availability: AvailabilityService,
    private readonly branches: BranchesService,
    private readonly zones: DeliveryZonesService,
  ) {}

  // ── Promotions (06-C01/09) ────────────────────────────────────────────

  async createPromotion(tenantId: string, input: PromotionRequestInput): Promise<PromotionResponse> {
    const validated = await this.validatePromotionInput(tenantId, input);
    try {
      const row = await this.repository.createPromotion({ tenantId, ...validated });
      return this.toPromotionResponse(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: CommercialErrorCode.PROMOTION_CODE_TAKEN,
          message: 'A promotion with this code already exists in the agency.',
        });
      }
      throw error;
    }
  }

  async getPromotion(tenantId: string, promotionId: string): Promise<PromotionResponse> {
    const row = await this.repository.findPromotion(tenantId, promotionId);
    if (!row) {
      throw new NotFoundException({
        code: CommercialErrorCode.PROMOTION_NOT_FOUND,
        message: 'Promotion not found in this agency.',
      });
    }
    return this.toPromotionResponse(row);
  }

  async listPromotions(tenantId: string): Promise<PromotionResponse[]> {
    const rows = await this.repository.listPromotions(tenantId);
    return rows.map((row) => this.toPromotionResponse(row));
  }

  async updatePromotion(
    tenantId: string,
    promotionId: string,
    patch: PromotionRequestInput,
  ): Promise<PromotionResponse> {
    const current = await this.repository.findPromotion(tenantId, promotionId);
    if (!current) {
      throw new NotFoundException({
        code: CommercialErrorCode.PROMOTION_NOT_FOUND,
        message: 'Promotion not found in this agency.',
      });
    }
    const merged: PromotionRequestInput = {
      code: patch.code ?? current.code,
      name: patch.name ?? current.name,
      discountType: patch.discountType ?? current.discountType,
      valueMinor: patch.valueMinor ?? current.valueMinor,
      minDurationUnits:
        patch.minDurationUnits === undefined ? current.minDurationUnits : patch.minDurationUnits,
      durationUnit: patch.durationUnit === undefined ? current.durationUnit : patch.durationUnit,
      effectiveFrom: patch.effectiveFrom ?? current.effectiveFrom.toISOString(),
      effectiveUntil:
        patch.effectiveUntil === undefined
          ? current.effectiveUntil?.toISOString() ?? null
          : patch.effectiveUntil,
      maxRedemptions:
        patch.maxRedemptions === undefined ? current.maxRedemptions : patch.maxRedemptions,
      active: patch.active ?? current.active,
      scopes: patch.scopes,
    };
    const validated = await this.validatePromotionInput(tenantId, merged);
    try {
      const row = await this.repository.updatePromotion(
        tenantId,
        promotionId,
        {
          code: validated.code,
          name: validated.name,
          discountType: validated.discountType,
          valueMinor: validated.valueMinor,
          minDurationUnits: validated.minDurationUnits,
          durationUnit: validated.durationUnit,
          effectiveFrom: validated.effectiveFrom,
          effectiveUntil: validated.effectiveUntil,
          maxRedemptions: validated.maxRedemptions,
          active: validated.active,
        },
        patch.scopes === undefined ? undefined : validated.scopes,
      );
      if (!row) {
        throw new NotFoundException({
          code: CommercialErrorCode.PROMOTION_NOT_FOUND,
          message: 'Promotion not found in this agency.',
        });
      }
      return this.toPromotionResponse(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: CommercialErrorCode.PROMOTION_CODE_TAKEN,
          message: 'A promotion with this code already exists in the agency.',
        });
      }
      throw error;
    }
  }

  private async validatePromotionInput(
    tenantId: string,
    input: PromotionRequestInput,
  ): Promise<{
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
  }> {
    const code = this.requireCode(input.code, CommercialErrorCode.PROMOTION_CODE_INVALID);
    const name = this.requireName(input.name, CommercialErrorCode.PROMOTION_NAME_INVALID);
    const { discountType, valueMinor } = this.validateDiscount(
      input.discountType,
      input.valueMinor,
      CommercialErrorCode.PROMOTION_VALUE_INVALID,
    );
    const { effectiveFrom, effectiveUntil } = this.validateWindow(
      input.effectiveFrom,
      input.effectiveUntil,
      CommercialErrorCode.PROMOTION_WINDOW_INVALID,
    );
    const minDurationUnits =
      input.minDurationUnits === null || input.minDurationUnits === undefined
        ? null
        : input.minDurationUnits;
    const durationUnit =
      input.durationUnit === null || input.durationUnit === undefined
        ? null
        : String(input.durationUnit).toUpperCase();
    if (minDurationUnits !== null || durationUnit !== null) {
      if (
        durationUnit === null ||
        minDurationUnits === null ||
        !(RATE_DURATION_UNITS as readonly string[]).includes(durationUnit) ||
        !Number.isInteger(minDurationUnits) ||
        minDurationUnits < 1
      ) {
        throw new ConflictException({
          code: CommercialErrorCode.PROMOTION_DURATION_INVALID,
          message: 'A duration requirement needs minDurationUnits (≥1) and a valid durationUnit.',
        });
      }
    }
    const maxRedemptions =
      input.maxRedemptions === null || input.maxRedemptions === undefined
        ? null
        : input.maxRedemptions;
    if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 0 || maxRedemptions > MAX_REDEMPTIONS)) {
      throw new ConflictException({
        code: CommercialErrorCode.PROMOTION_VALUE_INVALID,
        message: `maxRedemptions must be null or an integer in [0, ${MAX_REDEMPTIONS}].`,
      });
    }
    const scopes = await this.validatePromotionScopes(tenantId, input.scopes ?? []);
    return {
      code,
      name,
      discountType,
      valueMinor,
      minDurationUnits,
      durationUnit,
      effectiveFrom,
      effectiveUntil,
      maxRedemptions,
      active: input.active === undefined ? true : input.active === true,
      scopes,
    };
  }

  private async validatePromotionScopes(
    tenantId: string,
    scopes: PromotionScopeInput[],
  ): Promise<Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }>> {
    if (scopes.length > MAX_SCOPE_ROWS) {
      throw new ConflictException({
        code: CommercialErrorCode.PROMOTION_SCOPE_INVALID,
        message: `At most ${MAX_SCOPE_ROWS} scope rows per promotion.`,
      });
    }
    const seen = new Set<string>();
    const resolved: Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }> = [];
    for (const scope of scopes) {
      const vehicleId = scope.vehicleId ?? null;
      const categoryId = scope.categoryId ?? null;
      const branchId = scope.branchId ?? null;
      const dimensions = [vehicleId, categoryId, branchId].filter((v) => v !== null).length;
      if (dimensions === 0) {
        throw new ConflictException({
          code: CommercialErrorCode.PROMOTION_SCOPE_INVALID,
          message: 'Each promotion scope targets at least one of vehicleId, categoryId or branchId.',
        });
      }
      const key = `${vehicleId ?? ''}|${categoryId ?? ''}|${branchId ?? ''}`;
      if (seen.has(key)) {
        throw new ConflictException({
          code: CommercialErrorCode.PROMOTION_SCOPE_INVALID,
          message: 'Duplicate promotion scope.',
        });
      }
      seen.add(key);
      resolved.push({ vehicleId, categoryId, branchId });
    }
    for (const scope of resolved) {
      if (scope.vehicleId !== null) {
        const vehicle = await this.availability.findVehicleInTenant(tenantId, scope.vehicleId);
        if (!vehicle) {
          throw new ConflictException({
            code: CommercialErrorCode.VEHICLE_NOT_FOUND,
            message: 'Vehicle not found in this agency.',
          });
        }
      }
      if (scope.categoryId !== null) {
        const category = await this.availability.findCategoryInTenant(tenantId, scope.categoryId);
        if (!category) {
          throw new ConflictException({
            code: CommercialErrorCode.CATEGORY_NOT_FOUND,
            message: 'Category not found in this agency.',
          });
        }
      }
      if (scope.branchId !== null) {
        const branch = await this.branches.getBranch(tenantId, scope.branchId).catch(() => null);
        if (!branch) {
          throw new ConflictException({
            code: CommercialErrorCode.BRANCH_NOT_FOUND,
            message: 'Branch not found in this agency.',
          });
        }
      }
    }
    return resolved;
  }

  // ── Coupons (06-C02) ──────────────────────────────────────────────────

  async createCoupon(tenantId: string, input: CouponRequestInput): Promise<CouponResponse> {
    const validated = this.validateCouponInput(input);
    try {
      const row = await this.repository.createCoupon({ tenantId, ...validated });
      return this.toCouponResponse(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: CommercialErrorCode.COUPON_CODE_TAKEN,
          message: 'A coupon with this code already exists in the agency.',
        });
      }
      throw error;
    }
  }

  async getCoupon(tenantId: string, couponId: string): Promise<CouponResponse> {
    const row = await this.repository.findCoupon(tenantId, couponId);
    if (!row) {
      throw new NotFoundException({
        code: CommercialErrorCode.COUPON_NOT_FOUND,
        message: 'Coupon not found in this agency.',
      });
    }
    return this.toCouponResponse(row);
  }

  async listCoupons(tenantId: string): Promise<CouponResponse[]> {
    const rows = await this.repository.listCoupons(tenantId);
    return rows.map((row) => this.toCouponResponse(row));
  }

  async updateCoupon(
    tenantId: string,
    couponId: string,
    patch: CouponRequestInput,
  ): Promise<CouponResponse> {
    const current = await this.repository.findCoupon(tenantId, couponId);
    if (!current) {
      throw new NotFoundException({
        code: CommercialErrorCode.COUPON_NOT_FOUND,
        message: 'Coupon not found in this agency.',
      });
    }
    const merged: CouponRequestInput = {
      code: patch.code ?? current.code,
      name: patch.name ?? current.name,
      discountType: patch.discountType ?? current.discountType,
      valueMinor: patch.valueMinor ?? current.valueMinor,
      effectiveFrom: patch.effectiveFrom ?? current.effectiveFrom.toISOString(),
      effectiveUntil:
        patch.effectiveUntil === undefined
          ? current.effectiveUntil?.toISOString() ?? null
          : patch.effectiveUntil,
      maxUses: patch.maxUses === undefined ? current.maxUses : patch.maxUses,
      active: patch.active ?? current.active,
    };
    const validated = this.validateCouponInput(merged);
    try {
      const row = await this.repository.updateCoupon(tenantId, couponId, {
        code: validated.code,
        name: validated.name,
        discountType: validated.discountType,
        valueMinor: validated.valueMinor,
        effectiveFrom: validated.effectiveFrom,
        effectiveUntil: validated.effectiveUntil,
        maxUses: validated.maxUses,
        active: validated.active,
      });
      if (!row) {
        throw new NotFoundException({
          code: CommercialErrorCode.COUPON_NOT_FOUND,
          message: 'Coupon not found in this agency.',
        });
      }
      return this.toCouponResponse(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: CommercialErrorCode.COUPON_CODE_TAKEN,
          message: 'A coupon with this code already exists in the agency.',
        });
      }
      throw error;
    }
  }

  private validateCouponInput(input: CouponRequestInput): {
    code: string;
    name: string;
    discountType: CommercialDiscountType;
    valueMinor: number;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    maxUses: number | null;
    active: boolean;
  } {
    const code = this.requireCode(input.code, CommercialErrorCode.COUPON_CODE_INVALID);
    const name = this.requireName(input.name, CommercialErrorCode.COUPON_NAME_INVALID);
    const { discountType, valueMinor } = this.validateDiscount(
      input.discountType,
      input.valueMinor,
      CommercialErrorCode.COUPON_VALUE_INVALID,
    );
    const { effectiveFrom, effectiveUntil } = this.validateWindow(
      input.effectiveFrom,
      input.effectiveUntil,
      CommercialErrorCode.COUPON_WINDOW_INVALID,
    );
    const maxUses = input.maxUses === null || input.maxUses === undefined ? null : input.maxUses;
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > MAX_REDEMPTIONS)) {
      throw new ConflictException({
        code: CommercialErrorCode.COUPON_VALUE_INVALID,
        message: `maxUses must be null or an integer in [0, ${MAX_REDEMPTIONS}].`,
      });
    }
    return {
      code,
      name,
      discountType,
      valueMinor,
      effectiveFrom,
      effectiveUntil,
      maxUses,
      active: input.active === undefined ? true : input.active === true,
    };
  }

  // ── Extras (06-C03) ───────────────────────────────────────────────────

  async createExtra(tenantId: string, input: ExtraRequestInput): Promise<ExtraResponse> {
    const validated = this.validateExtraInput(input);
    try {
      const row = await this.repository.createExtra({ tenantId, ...validated });
      return this.toExtraResponse(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: CommercialErrorCode.EXTRA_KEY_TAKEN,
          message: 'An extra with this key already exists in the agency.',
        });
      }
      throw error;
    }
  }

  async getExtra(tenantId: string, extraId: string): Promise<ExtraResponse> {
    const row = await this.repository.findExtra(tenantId, extraId);
    if (!row) {
      throw new NotFoundException({
        code: CommercialErrorCode.EXTRA_NOT_FOUND,
        message: 'Extra not found in this agency.',
      });
    }
    return this.toExtraResponse(row);
  }

  async listExtras(tenantId: string): Promise<ExtraResponse[]> {
    const rows = await this.repository.listExtras(tenantId);
    return rows.map((row) => this.toExtraResponse(row));
  }

  async updateExtra(
    tenantId: string,
    extraId: string,
    patch: ExtraRequestInput,
  ): Promise<ExtraResponse> {
    const current = await this.repository.findExtra(tenantId, extraId);
    if (!current) {
      throw new NotFoundException({
        code: CommercialErrorCode.EXTRA_NOT_FOUND,
        message: 'Extra not found in this agency.',
      });
    }
    const merged: ExtraRequestInput = {
      key: patch.key ?? current.key,
      type: patch.type ?? current.type,
      name: patch.name ?? current.name,
      pricingUnit: patch.pricingUnit ?? current.pricingUnit,
      amountMinor: patch.amountMinor ?? current.amountMinor,
      active: patch.active ?? current.active,
    };
    const validated = this.validateExtraInput(merged);
    try {
      const row = await this.repository.updateExtra(tenantId, extraId, {
        key: validated.key,
        type: validated.type,
        name: validated.name,
        pricingUnit: validated.pricingUnit,
        amountMinor: validated.amountMinor,
        active: validated.active,
      });
      if (!row) {
        throw new NotFoundException({
          code: CommercialErrorCode.EXTRA_NOT_FOUND,
          message: 'Extra not found in this agency.',
        });
      }
      return this.toExtraResponse(row);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: CommercialErrorCode.EXTRA_KEY_TAKEN,
          message: 'An extra with this key already exists in the agency.',
        });
      }
      throw error;
    }
  }

  private validateExtraInput(input: ExtraRequestInput): {
    key: string;
    type: ExtraType;
    name: string;
    pricingUnit: ExtraPricingUnit;
    amountMinor: number;
    active: boolean;
  } {
    const key = this.requireCode(input.key, CommercialErrorCode.EXTRA_KEY_INVALID);
    const name = this.requireName(input.name, CommercialErrorCode.EXTRA_NAME_INVALID);
    const type = String(input.type ?? '').toUpperCase();
    if (!(EXTRA_TYPES as readonly string[]).includes(type)) {
      throw new ConflictException({
        code: CommercialErrorCode.EXTRA_TYPE_INVALID,
        message: `type must be one of ${EXTRA_TYPES.join(', ')}.`,
      });
    }
    const pricingUnit = String(input.pricingUnit ?? '').toUpperCase();
    if (!(EXTRA_PRICING_UNITS as readonly string[]).includes(pricingUnit)) {
      throw new ConflictException({
        code: CommercialErrorCode.EXTRA_UNIT_INVALID,
        message: `pricingUnit must be one of ${EXTRA_PRICING_UNITS.join(', ')}.`,
      });
    }
    if (
      input.amountMinor === undefined ||
      !Number.isInteger(input.amountMinor) ||
      input.amountMinor < 0 ||
      input.amountMinor > MAX_EXTRA_AMOUNT_MINOR
    ) {
      throw new ConflictException({
        code: CommercialErrorCode.EXTRA_AMOUNT_INVALID,
        message: `amountMinor must be an integer in [0, ${MAX_EXTRA_AMOUNT_MINOR}].`,
      });
    }
    return {
      key,
      type: type as ExtraType,
      name,
      pricingUnit: pricingUnit as ExtraPricingUnit,
      amountMinor: input.amountMinor,
      active: input.active === undefined ? true : input.active === true,
    };
  }

  // ── Fee rules (06-C04..C07) ───────────────────────────────────────────

  async createFeeRule(tenantId: string, input: FeeRuleRequestInput): Promise<FeeRuleResponse> {
    const validated = await this.validateFeeRuleInput(tenantId, input);
    const row = await this.repository.createFeeRule({ tenantId, ...validated });
    return this.toFeeRuleResponse(row);
  }

  async getFeeRule(tenantId: string, feeRuleId: string): Promise<FeeRuleResponse> {
    const row = await this.repository.findFeeRule(tenantId, feeRuleId);
    if (!row) {
      throw new NotFoundException({
        code: CommercialErrorCode.FEE_RULE_NOT_FOUND,
        message: 'Fee rule not found in this agency.',
      });
    }
    return this.toFeeRuleResponse(row);
  }

  async listFeeRules(tenantId: string): Promise<FeeRuleResponse[]> {
    const rows = await this.repository.listFeeRules(tenantId);
    return rows.map((row) => this.toFeeRuleResponse(row));
  }

  async updateFeeRule(
    tenantId: string,
    feeRuleId: string,
    patch: FeeRuleRequestInput,
  ): Promise<FeeRuleResponse> {
    const current = await this.repository.findFeeRule(tenantId, feeRuleId);
    if (!current) {
      throw new NotFoundException({
        code: CommercialErrorCode.FEE_RULE_NOT_FOUND,
        message: 'Fee rule not found in this agency.',
      });
    }
    const merged: FeeRuleRequestInput = {
      kind: patch.kind ?? current.kind,
      deliveryZoneId:
        patch.deliveryZoneId === undefined ? current.deliveryZoneId : patch.deliveryZoneId,
      branchId: patch.branchId === undefined ? current.branchId : patch.branchId,
      baseMinor: patch.baseMinor ?? current.baseMinor,
      perKmMinor: patch.perKmMinor === undefined ? current.perKmMinor : patch.perKmMinor,
      perOccurrenceMinor:
        patch.perOccurrenceMinor === undefined ? current.perOccurrenceMinor : patch.perOccurrenceMinor,
      active: patch.active ?? current.active,
    };
    const validated = await this.validateFeeRuleInput(tenantId, merged);
    const row = await this.repository.updateFeeRule(tenantId, feeRuleId, {
      kind: validated.kind,
      deliveryZoneId: validated.deliveryZoneId,
      branchId: validated.branchId,
      baseMinor: validated.baseMinor,
      perKmMinor: validated.perKmMinor,
      perOccurrenceMinor: validated.perOccurrenceMinor,
      active: validated.active,
    });
    if (!row) {
      throw new NotFoundException({
        code: CommercialErrorCode.FEE_RULE_NOT_FOUND,
        message: 'Fee rule not found in this agency.',
      });
    }
    return this.toFeeRuleResponse(row);
  }

  private async validateFeeRuleInput(
    tenantId: string,
    input: FeeRuleRequestInput,
  ): Promise<{
    kind: FeeRuleKind;
    deliveryZoneId: string | null;
    branchId: string | null;
    baseMinor: number;
    perKmMinor: number | null;
    perOccurrenceMinor: number | null;
    active: boolean;
  }> {
    const kind = String(input.kind ?? '').toUpperCase();
    if (!(Object.values(FeeRuleKindDomain) as string[]).includes(kind)) {
      throw new ConflictException({
        code: CommercialErrorCode.FEE_RULE_INVALID,
        message: `kind must be one of ${Object.values(FeeRuleKindDomain).join(', ')}.`,
      });
    }
    const baseMinor = input.baseMinor ?? 0;
    if (!Number.isInteger(baseMinor) || baseMinor < 0 || baseMinor > MAX_DISCOUNT_MINOR) {
      throw new ConflictException({
        code: CommercialErrorCode.FEE_RULE_INVALID,
        message: `baseMinor must be an integer in [0, ${MAX_DISCOUNT_MINOR}].`,
      });
    }
    const perKmMinor = input.perKmMinor === null || input.perKmMinor === undefined ? null : input.perKmMinor;
    const perOccurrenceMinor =
      input.perOccurrenceMinor === null || input.perOccurrenceMinor === undefined
        ? null
        : input.perOccurrenceMinor;

    const deliveryZoneId = input.deliveryZoneId ?? null;
    const branchId = input.branchId ?? null;

    if (deliveryZoneId !== null && kind !== 'DELIVERY_FEE' && kind !== 'DISTANCE_FEE') {
      throw new ConflictException({
        code: CommercialErrorCode.FEE_RULE_TARGET_INVALID,
        message: `${kind} rules do not target a delivery zone.`,
      });
    }
    if (branchId !== null && kind !== 'AFTER_HOURS_FEE') {
      throw new ConflictException({
        code: CommercialErrorCode.FEE_RULE_TARGET_INVALID,
        message: 'Only AFTER_HOURS_FEE rules target a branch.',
      });
    }
    if (kind === 'DISTANCE_FEE') {
      if (deliveryZoneId === null || perKmMinor === null || !Number.isInteger(perKmMinor) || perKmMinor <= 0) {
        throw new ConflictException({
          code: CommercialErrorCode.FEE_RULE_INVALID,
          message: 'DISTANCE_FEE requires a delivery zone and a positive perKmMinor.',
        });
      }
    }
    if (kind === 'AFTER_HOURS_FEE') {
      if (perOccurrenceMinor === null || !Number.isInteger(perOccurrenceMinor) || perOccurrenceMinor <= 0) {
        throw new ConflictException({
          code: CommercialErrorCode.FEE_RULE_INVALID,
          message: 'AFTER_HOURS_FEE requires a positive perOccurrenceMinor.',
        });
      }
    }
    if (deliveryZoneId !== null) {
      const zones = await this.zones.listZones(tenantId);
      if (!zones.some((zone) => zone.id === deliveryZoneId)) {
        throw new ConflictException({
          code: CommercialErrorCode.DELIVERY_ZONE_NOT_FOUND,
          message: 'Delivery zone not found in this agency.',
        });
      }
    }
    if (branchId !== null) {
      const branch = await this.branches.getBranch(tenantId, branchId).catch(() => null);
      if (!branch) {
        throw new ConflictException({
          code: CommercialErrorCode.BRANCH_NOT_FOUND,
          message: 'Branch not found in this agency.',
        });
      }
    }
    return {
      kind: kind as FeeRuleKind,
      deliveryZoneId,
      branchId,
      baseMinor,
      perKmMinor,
      perOccurrenceMinor,
      active: input.active === undefined ? true : input.active === true,
    };
  }

  // ── Deposit policies (06-C08) ─────────────────────────────────────────

  async createDepositPolicy(
    tenantId: string,
    input: DepositPolicyRequestInput,
  ): Promise<DepositPolicyResponse> {
    const validated = await this.validateDepositPolicyInput(tenantId, input);
    const row = await this.repository.createDepositPolicy({ tenantId, ...validated });
    return this.toDepositPolicyResponse(row);
  }

  async getDepositPolicy(tenantId: string, policyId: string): Promise<DepositPolicyResponse> {
    const row = await this.repository.findDepositPolicy(tenantId, policyId);
    if (!row) {
      throw new NotFoundException({
        code: CommercialErrorCode.DEPOSIT_POLICY_NOT_FOUND,
        message: 'Deposit policy not found in this agency.',
      });
    }
    return this.toDepositPolicyResponse(row);
  }

  async listDepositPolicies(tenantId: string): Promise<DepositPolicyResponse[]> {
    const rows = await this.repository.listDepositPolicies(tenantId);
    return rows.map((row) => this.toDepositPolicyResponse(row));
  }

  async updateDepositPolicy(
    tenantId: string,
    policyId: string,
    patch: DepositPolicyRequestInput,
  ): Promise<DepositPolicyResponse> {
    const current = await this.repository.findDepositPolicy(tenantId, policyId);
    if (!current) {
      throw new NotFoundException({
        code: CommercialErrorCode.DEPOSIT_POLICY_NOT_FOUND,
        message: 'Deposit policy not found in this agency.',
      });
    }
    const merged: DepositPolicyRequestInput = {
      name: patch.name ?? current.name,
      depositType: patch.depositType ?? current.depositType,
      valueMinor: patch.valueMinor ?? current.valueMinor,
      active: patch.active ?? current.active,
      scopes: patch.scopes,
    };
    const validated = await this.validateDepositPolicyInput(tenantId, merged);
    const row = await this.repository.updateDepositPolicy(
      tenantId,
      policyId,
      {
        name: validated.name,
        depositType: validated.depositType,
        valueMinor: validated.valueMinor,
        active: validated.active,
      },
      patch.scopes === undefined ? undefined : validated.scopes,
    );
    if (!row) {
      throw new NotFoundException({
        code: CommercialErrorCode.DEPOSIT_POLICY_NOT_FOUND,
        message: 'Deposit policy not found in this agency.',
      });
    }
    return this.toDepositPolicyResponse(row);
  }

  private async validateDepositPolicyInput(
    tenantId: string,
    input: DepositPolicyRequestInput,
  ): Promise<{
    name: string;
    depositType: DepositPolicyType;
    valueMinor: number;
    active: boolean;
    scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
  }> {
    const name = this.requireName(input.name, CommercialErrorCode.DEPOSIT_POLICY_NAME_INVALID);
    const depositType = String(input.depositType ?? '').toUpperCase();
    if (depositType !== 'FIXED_MINOR' && depositType !== 'PERCENT_OF_TOTAL') {
      throw new ConflictException({
        code: CommercialErrorCode.DEPOSIT_POLICY_VALUE_INVALID,
        message: 'depositType must be FIXED_MINOR or PERCENT_OF_TOTAL.',
      });
    }
    const cap = depositType === 'PERCENT_OF_TOTAL' ? MAX_DISCOUNT_BASIS_POINTS : MAX_DISCOUNT_MINOR;
    const numeric = typeof input.valueMinor === 'number' ? input.valueMinor : NaN;
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > cap) {
      throw new ConflictException({
        code: CommercialErrorCode.DEPOSIT_POLICY_VALUE_INVALID,
        message: `valueMinor must be an integer in [0, ${cap}] (basis points for PERCENT_OF_TOTAL).`,
      });
    }
    const scopes = await this.validateDepositScopes(tenantId, input.scopes ?? []);
    return {
      name,
      depositType,
      valueMinor: numeric,
      active: input.active === undefined ? true : input.active === true,
      scopes,
    };
  }

  private async validateDepositScopes(
    tenantId: string,
    scopes: DepositPolicyScopeInput[],
  ): Promise<Array<{ vehicleId: string | null; categoryId: string | null }>> {
    if (scopes.length > MAX_SCOPE_ROWS) {
      throw new ConflictException({
        code: CommercialErrorCode.DEPOSIT_POLICY_SCOPE_INVALID,
        message: `At most ${MAX_SCOPE_ROWS} scope rows per deposit policy.`,
      });
    }
    const seen = new Set<string>();
    const resolved: Array<{ vehicleId: string | null; categoryId: string | null }> = [];
    for (const scope of scopes) {
      const vehicleId = scope.vehicleId ?? null;
      const categoryId = scope.categoryId ?? null;
      if ((vehicleId === null) === (categoryId === null)) {
        throw new ConflictException({
          code: CommercialErrorCode.DEPOSIT_POLICY_SCOPE_INVALID,
          message: 'Each deposit scope targets exactly one of vehicleId or categoryId.',
        });
      }
      const key = `${vehicleId ?? ''}|${categoryId ?? ''}`;
      if (seen.has(key)) {
        throw new ConflictException({
          code: CommercialErrorCode.DEPOSIT_POLICY_SCOPE_INVALID,
          message: 'Duplicate deposit policy scope.',
        });
      }
      seen.add(key);
      resolved.push({ vehicleId, categoryId });
    }
    for (const scope of resolved) {
      if (scope.vehicleId !== null) {
        const vehicle = await this.availability.findVehicleInTenant(tenantId, scope.vehicleId);
        if (!vehicle) {
          throw new ConflictException({
            code: CommercialErrorCode.VEHICLE_NOT_FOUND,
            message: 'Vehicle not found in this agency.',
          });
        }
      } else if (scope.categoryId !== null) {
        const category = await this.availability.findCategoryInTenant(tenantId, scope.categoryId);
        if (!category) {
          throw new ConflictException({
            code: CommercialErrorCode.CATEGORY_NOT_FOUND,
            message: 'Category not found in this agency.',
          });
        }
      }
    }
    return resolved;
  }

  // ── Shared validation helpers ─────────────────────────────────────────

  private requireCode(value: unknown, code: CommercialErrorCodeValue): string {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!COMMERCIAL_CODE_PATTERN.test(normalized)) {
      throw new ConflictException({
        code,
        message: 'code/key must be 2–32 characters of A–Z, 0–9, _ or - starting with a letter or digit.',
      });
    }
    return normalized;
  }

  private requireName(value: unknown, code: CommercialErrorCodeValue): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name.length < 1 || name.length > MAX_COMMERCIAL_NAME_LENGTH) {
      throw new ConflictException({
        code,
        message: `name is required (1–${MAX_COMMERCIAL_NAME_LENGTH} characters).`,
      });
    }
    return name;
  }

  private validateDiscount(
    discountType: unknown,
    valueMinor: unknown,
    code: CommercialErrorCodeValue,
  ): { discountType: CommercialDiscountType; valueMinor: number } {
    const type = (typeof discountType === 'string' ? discountType : '').toUpperCase();
    if (type !== 'PERCENT' && type !== 'FIXED_MINOR') {
      throw new ConflictException({
        code,
        message: 'discountType must be PERCENT or FIXED_MINOR.',
      });
    }
    const cap = type === 'PERCENT' ? MAX_DISCOUNT_BASIS_POINTS : MAX_DISCOUNT_MINOR;
    const numeric = typeof valueMinor === 'number' ? valueMinor : NaN;
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > cap) {
      throw new ConflictException({
        code,
        message: `valueMinor must be an integer in [0, ${cap}] (basis points for PERCENT).`,
      });
    }
    return { discountType: type, valueMinor: numeric };
  }

  private validateWindow(
    effectiveFrom: unknown,
    effectiveUntil: unknown,
    code: CommercialErrorCodeValue,
  ): { effectiveFrom: Date; effectiveUntil: Date | null } {
    const from = parseUtcInstant(typeof effectiveFrom === 'string' ? effectiveFrom : '');
    if (!from) {
      throw new ConflictException({
        code,
        message: 'effectiveFrom must be a valid instant.',
      });
    }
    if (effectiveUntil !== null && effectiveUntil !== undefined) {
      const until = parseUtcInstant(typeof effectiveUntil === 'string' ? effectiveUntil : '');
      if (!until || until.getTime() <= from.getTime()) {
        throw new ConflictException({
          code,
          message: 'effectiveUntil must be a valid instant strictly after effectiveFrom.',
        });
      }
      return { effectiveFrom: from, effectiveUntil: until };
    }
    return { effectiveFrom: from, effectiveUntil: null };
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  // ── Response mapping ──────────────────────────────────────────────────

  private toPromotionResponse(row: PromotionRow): PromotionResponse {
    return {
      promotionId: row.id,
      code: row.code,
      name: row.name,
      discountType: row.discountType,
      valueMinor: row.valueMinor,
      minDurationUnits: row.minDurationUnits,
      durationUnit: row.durationUnit,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
      maxRedemptions: row.maxRedemptions,
      redemptionsCount: row.redemptionsCount,
      active: row.active,
      scopes: row.scopes.map((scope) => ({
        vehicleId: scope.vehicleId,
        categoryId: scope.categoryId,
        branchId: scope.branchId,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCouponResponse(row: CouponRow): CouponResponse {
    return {
      couponId: row.id,
      code: row.code,
      name: row.name,
      discountType: row.discountType,
      valueMinor: row.valueMinor,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toExtraResponse(row: ExtraRow): ExtraResponse {
    return {
      extraId: row.id,
      key: row.key,
      type: row.type,
      name: row.name,
      pricingUnit: row.pricingUnit,
      amountMinor: row.amountMinor,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toFeeRuleResponse(row: FeeRuleRow): FeeRuleResponse {
    return {
      feeRuleId: row.id,
      kind: row.kind,
      deliveryZoneId: row.deliveryZoneId,
      branchId: row.branchId,
      baseMinor: row.baseMinor,
      perKmMinor: row.perKmMinor,
      perOccurrenceMinor: row.perOccurrenceMinor,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDepositPolicyResponse(row: DepositPolicyRow): DepositPolicyResponse {
    return {
      depositPolicyId: row.id,
      name: row.name,
      depositType: row.depositType,
      valueMinor: row.valueMinor,
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
