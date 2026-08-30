/**
 * Tenant domain rules (02-A).
 *
 * Stable error codes surfaced through the documented API envelope.
 */
export const TenantErrorCode = {
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  SLUG_TAKEN: 'SLUG_TAKEN',
  TENANT_NOT_ACTIVE: 'TENANT_NOT_ACTIVE',
  TENANT_VALIDATION_FAILED: 'TENANT_VALIDATION_FAILED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
} as const;

export type TenantErrorCodeValue = (typeof TenantErrorCode)[keyof typeof TenantErrorCode];

/** Public slug shape: URL-safe lowercase letters/digits/hyphens (02-A04). */
export const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TENANT_SLUG_MIN = 3;
export const TENANT_SLUG_MAX = 60;
export const TENANT_NAME_MAX = 120;

export function isValidTenantSlug(slug: string): boolean {
  return (
    slug.length >= TENANT_SLUG_MIN &&
    slug.length <= TENANT_SLUG_MAX &&
    TENANT_SLUG_PATTERN.test(slug)
  );
}
