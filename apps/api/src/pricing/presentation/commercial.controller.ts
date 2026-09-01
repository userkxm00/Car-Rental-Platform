import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import type {
  CouponRequestInput,
  CouponResponse,
  DepositPolicyRequestInput,
  DepositPolicyResponse,
  ExtraRequestInput,
  ExtraResponse,
  FeeRuleRequestInput,
  FeeRuleResponse,
  PromotionRequestInput,
  PromotionResponse,
} from '../domain/commercial-contract';
import { CommercialService } from '../application/commercial.service';

/**
 * PHASE-06 / 06-C: commercial-adjustment administration API.
 *
 * - POST/GET/PATCH /api/v1/agencies/:agencyId/pricing/promotions
 * - POST/GET/PATCH /api/v1/agencies/:agencyId/pricing/coupons
 * - POST/GET/PATCH /api/v1/agencies/:agencyId/pricing/extras
 * - POST/GET/PATCH /api/v1/agencies/:agencyId/pricing/fee-rules
 * - POST/GET/PATCH /api/v1/agencies/:agencyId/pricing/deposit-policies
 *
 * Reads require `pricing.read`, writes `pricing.manage` (FINANCE can read
 * but never manage). All routes are agency-scoped; scope targets are
 * validated against tenant-owned vehicles/categories/branches/zones
 * server-side. Clients never submit their own amounts.
 */
@Controller('agencies/:agencyId/pricing/commercial')
export class CommercialController {
  constructor(private readonly service: CommercialService) {}

  // ── Promotions ────────────────────────────────────────────────────────

  @Post('promotions')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async createPromotion(
    @Param('agencyId') agencyId: string,
    @Body() body: PromotionRequestInput,
  ): Promise<PromotionResponse> {
    return this.service.createPromotion(agencyId, body ?? {});
  }

  @Get('promotions')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async listPromotions(@Param('agencyId') agencyId: string): Promise<PromotionResponse[]> {
    return this.service.listPromotions(agencyId);
  }

  @Get('promotions/:promotionId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async getPromotion(
    @Param('agencyId') agencyId: string,
    @Param('promotionId') promotionId: string,
  ): Promise<PromotionResponse> {
    return this.service.getPromotion(agencyId, promotionId);
  }

  @Patch('promotions/:promotionId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async updatePromotion(
    @Param('agencyId') agencyId: string,
    @Param('promotionId') promotionId: string,
    @Body() body: PromotionRequestInput,
  ): Promise<PromotionResponse> {
    return this.service.updatePromotion(agencyId, promotionId, body ?? {});
  }

  // ── Coupons ───────────────────────────────────────────────────────────

  @Post('coupons')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async createCoupon(
    @Param('agencyId') agencyId: string,
    @Body() body: CouponRequestInput,
  ): Promise<CouponResponse> {
    return this.service.createCoupon(agencyId, body ?? {});
  }

  @Get('coupons')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async listCoupons(@Param('agencyId') agencyId: string): Promise<CouponResponse[]> {
    return this.service.listCoupons(agencyId);
  }

  @Get('coupons/:couponId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async getCoupon(
    @Param('agencyId') agencyId: string,
    @Param('couponId') couponId: string,
  ): Promise<CouponResponse> {
    return this.service.getCoupon(agencyId, couponId);
  }

  @Patch('coupons/:couponId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async updateCoupon(
    @Param('agencyId') agencyId: string,
    @Param('couponId') couponId: string,
    @Body() body: CouponRequestInput,
  ): Promise<CouponResponse> {
    return this.service.updateCoupon(agencyId, couponId, body ?? {});
  }

  // ── Extras ────────────────────────────────────────────────────────────

  @Post('extras')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async createExtra(
    @Param('agencyId') agencyId: string,
    @Body() body: ExtraRequestInput,
  ): Promise<ExtraResponse> {
    return this.service.createExtra(agencyId, body ?? {});
  }

  @Get('extras')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async listExtras(@Param('agencyId') agencyId: string): Promise<ExtraResponse[]> {
    return this.service.listExtras(agencyId);
  }

  @Get('extras/:extraId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async getExtra(
    @Param('agencyId') agencyId: string,
    @Param('extraId') extraId: string,
  ): Promise<ExtraResponse> {
    return this.service.getExtra(agencyId, extraId);
  }

  @Patch('extras/:extraId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async updateExtra(
    @Param('agencyId') agencyId: string,
    @Param('extraId') extraId: string,
    @Body() body: ExtraRequestInput,
  ): Promise<ExtraResponse> {
    return this.service.updateExtra(agencyId, extraId, body ?? {});
  }

  // ── Fee rules ─────────────────────────────────────────────────────────

  @Post('fee-rules')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async createFeeRule(
    @Param('agencyId') agencyId: string,
    @Body() body: FeeRuleRequestInput,
  ): Promise<FeeRuleResponse> {
    return this.service.createFeeRule(agencyId, body ?? {});
  }

  @Get('fee-rules')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async listFeeRules(@Param('agencyId') agencyId: string): Promise<FeeRuleResponse[]> {
    return this.service.listFeeRules(agencyId);
  }

  @Get('fee-rules/:feeRuleId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async getFeeRule(
    @Param('agencyId') agencyId: string,
    @Param('feeRuleId') feeRuleId: string,
  ): Promise<FeeRuleResponse> {
    return this.service.getFeeRule(agencyId, feeRuleId);
  }

  @Patch('fee-rules/:feeRuleId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async updateFeeRule(
    @Param('agencyId') agencyId: string,
    @Param('feeRuleId') feeRuleId: string,
    @Body() body: FeeRuleRequestInput,
  ): Promise<FeeRuleResponse> {
    return this.service.updateFeeRule(agencyId, feeRuleId, body ?? {});
  }

  // ── Deposit policies ──────────────────────────────────────────────────

  @Post('deposit-policies')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async createDepositPolicy(
    @Param('agencyId') agencyId: string,
    @Body() body: DepositPolicyRequestInput,
  ): Promise<DepositPolicyResponse> {
    return this.service.createDepositPolicy(agencyId, body ?? {});
  }

  @Get('deposit-policies')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async listDepositPolicies(
    @Param('agencyId') agencyId: string,
  ): Promise<DepositPolicyResponse[]> {
    return this.service.listDepositPolicies(agencyId);
  }

  @Get('deposit-policies/:depositPolicyId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_READ)
  async getDepositPolicy(
    @Param('agencyId') agencyId: string,
    @Param('depositPolicyId') depositPolicyId: string,
  ): Promise<DepositPolicyResponse> {
    return this.service.getDepositPolicy(agencyId, depositPolicyId);
  }

  @Patch('deposit-policies/:depositPolicyId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.PRICING_MANAGE)
  async updateDepositPolicy(
    @Param('agencyId') agencyId: string,
    @Param('depositPolicyId') depositPolicyId: string,
    @Body() body: DepositPolicyRequestInput,
  ): Promise<DepositPolicyResponse> {
    return this.service.updateDepositPolicy(agencyId, depositPolicyId, body ?? {});
  }
}
