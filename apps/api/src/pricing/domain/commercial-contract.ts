/**
 * PHASE-06 / 06-C: commercial-adjustment contracts. Money is integer
 * minor units; PERCENT values are basis points; clients never submit
 * their own amounts (extras are priced from the tenant catalog).
 */

export const CommercialErrorCode = {
  PROMOTION_NOT_FOUND: 'PROMOTION_NOT_FOUND',
  PROMOTION_CODE_TAKEN: 'PROMOTION_CODE_TAKEN',
  PROMOTION_CODE_INVALID: 'PROMOTION_CODE_INVALID',
  PROMOTION_NAME_INVALID: 'PROMOTION_NAME_INVALID',
  PROMOTION_VALUE_INVALID: 'PROMOTION_VALUE_INVALID',
  PROMOTION_WINDOW_INVALID: 'PROMOTION_WINDOW_INVALID',
  PROMOTION_DURATION_INVALID: 'PROMOTION_DURATION_INVALID',
  PROMOTION_SCOPE_INVALID: 'PROMOTION_SCOPE_INVALID',
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  COUPON_CODE_TAKEN: 'COUPON_CODE_TAKEN',
  COUPON_CODE_INVALID: 'COUPON_CODE_INVALID',
  COUPON_NAME_INVALID: 'COUPON_NAME_INVALID',
  COUPON_VALUE_INVALID: 'COUPON_VALUE_INVALID',
  COUPON_WINDOW_INVALID: 'COUPON_WINDOW_INVALID',
  EXTRA_NOT_FOUND: 'EXTRA_NOT_FOUND',
  EXTRA_KEY_TAKEN: 'EXTRA_KEY_TAKEN',
  EXTRA_KEY_INVALID: 'EXTRA_KEY_INVALID',
  EXTRA_NAME_INVALID: 'EXTRA_NAME_INVALID',
  EXTRA_TYPE_INVALID: 'EXTRA_TYPE_INVALID',
  EXTRA_UNIT_INVALID: 'EXTRA_UNIT_INVALID',
  EXTRA_AMOUNT_INVALID: 'EXTRA_AMOUNT_INVALID',
  FEE_RULE_NOT_FOUND: 'FEE_RULE_NOT_FOUND',
  FEE_RULE_INVALID: 'FEE_RULE_INVALID',
  FEE_RULE_TARGET_INVALID: 'FEE_RULE_TARGET_INVALID',
  DEPOSIT_POLICY_NOT_FOUND: 'DEPOSIT_POLICY_NOT_FOUND',
  DEPOSIT_POLICY_NAME_INVALID: 'DEPOSIT_POLICY_NAME_INVALID',
  DEPOSIT_POLICY_VALUE_INVALID: 'DEPOSIT_POLICY_VALUE_INVALID',
  DEPOSIT_POLICY_SCOPE_INVALID: 'DEPOSIT_POLICY_SCOPE_INVALID',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  DELIVERY_ZONE_NOT_FOUND: 'DELIVERY_ZONE_NOT_FOUND',
} as const;

export type CommercialErrorCodeValue =
  (typeof CommercialErrorCode)[keyof typeof CommercialErrorCode];

export const COMMERCIAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
export const MAX_COMMERCIAL_NAME_LENGTH = 120;

export interface PromotionScopeInput {
  vehicleId?: string | null;
  categoryId?: string | null;
  branchId?: string | null;
}

export interface PromotionRequestInput {
  code?: string;
  name?: string;
  discountType?: string;
  valueMinor?: number;
  minDurationUnits?: number | null;
  durationUnit?: string | null;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  maxRedemptions?: number | null;
  active?: boolean;
  scopes?: PromotionScopeInput[];
}

export interface PromotionResponse {
  promotionId: string;
  code: string;
  name: string;
  discountType: string;
  valueMinor: number;
  minDurationUnits: number | null;
  durationUnit: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  maxRedemptions: number | null;
  redemptionsCount: number;
  active: boolean;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null; branchId: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export interface CouponRequestInput {
  code?: string;
  name?: string;
  discountType?: string;
  valueMinor?: number;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  maxUses?: number | null;
  active?: boolean;
}

export interface CouponResponse {
  couponId: string;
  code: string;
  name: string;
  discountType: string;
  valueMinor: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExtraRequestInput {
  key?: string;
  type?: string;
  name?: string;
  pricingUnit?: string;
  amountMinor?: number;
  active?: boolean;
}

export interface ExtraResponse {
  extraId: string;
  key: string;
  type: string;
  name: string;
  pricingUnit: string;
  amountMinor: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeeRuleRequestInput {
  kind?: string;
  deliveryZoneId?: string | null;
  branchId?: string | null;
  baseMinor?: number;
  perKmMinor?: number | null;
  perOccurrenceMinor?: number | null;
  active?: boolean;
}

export interface FeeRuleResponse {
  feeRuleId: string;
  kind: string;
  deliveryZoneId: string | null;
  branchId: string | null;
  baseMinor: number;
  perKmMinor: number | null;
  perOccurrenceMinor: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DepositPolicyScopeInput {
  vehicleId?: string | null;
  categoryId?: string | null;
}

export interface DepositPolicyRequestInput {
  name?: string;
  depositType?: string;
  valueMinor?: number;
  active?: boolean;
  scopes?: DepositPolicyScopeInput[];
}

export interface DepositPolicyResponse {
  depositPolicyId: string;
  name: string;
  depositType: string;
  valueMinor: number;
  active: boolean;
  scopes: Array<{ vehicleId: string | null; categoryId: string | null }>;
  createdAt: string;
  updatedAt: string;
}
