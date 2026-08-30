/**
 * Identity domain error codes (01-C03/01-C05).
 *
 * Stable machine-readable codes surfaced through the documented API error
 * envelope; clients match on these.
 */
export const IdentityErrorCode = {
  USER_DISABLED: 'USER_DISABLED',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  PHONE_TAKEN: 'PHONE_TAKEN',
  PROFILE_VALIDATION_FAILED: 'PROFILE_VALIDATION_FAILED',
} as const;

export type IdentityErrorCodeValue = (typeof IdentityErrorCode)[keyof typeof IdentityErrorCode];

/** Supported display locales (docs: Arabic, French, English). */
export const SUPPORTED_LOCALES = ['ar', 'fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
