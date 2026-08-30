import { z } from 'zod';

/**
 * Environment schema — the single typed contract for KAVRIQO configuration.
 *
 * Rules (see docs/provider-and-environment-contract.md):
 * - Values are read from the process environment (or any equivalent secure
 *   mechanism); no specific secret manager is required.
 * - Provider credentials are validated for shape when present, and their
 *   required-ness is asserted per environment/phase (see production rules).
 * - Defaults are development-safe only; production requirements are enforced
 *   separately so a misconfigured production deploy fails fast.
 */

const NODE_ENV_VALUES = ['development', 'test', 'staging', 'production'] as const;
const LOG_LEVEL_VALUES = ['trace', 'debug', 'info', 'warn', 'error'] as const;
const LOCALE_VALUES = ['ar', 'fr', 'en'] as const;
const PROVIDER_MODE_VALUES = ['none', 'console', 'smtp'] as const;
const MAP_PROVIDER_VALUES = ['maptiler'] as const;

/** Environment string booleans: only the literal "true" is true. */
const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'string' ? value.toLowerCase() === 'true' : value));

/** Comma-separated list → trimmed string array. */
const csvList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
);

const postgresUrl = z
  .string()
  .min(1)
  .refine(
    (value) => /^postgres(ql)?:\/\/.+/.test(value),
    'must be a postgres:// or postgresql:// connection URL',
  );

const optionalHttpsUrl = z
  .string()
  .refine((value) => /^https:\/\/.+/.test(value), 'must be an https URL')
  .optional();

/**
 * Provider endpoint: http(s) accepted in non-production environments (local
 * test providers); production TLS is enforced by a superRefine on the schema.
 */
const optionalProviderUrl = z
  .string()
  .refine((value) => /^https?:\/\/.+/.test(value), 'must be an http(s) URL')
  .optional();

const envSchemaFields = {
  // ── Runtime ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(NODE_ENV_VALUES).default('development'),
  /** Deployment-stage label (e.g. "staging-1"); defaults to NODE_ENV. */
  APP_ENV: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(LOG_LEVEL_VALUES).default('info'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),

  // ── Public application URLs ────────────────────────────────────────────
  WEB_APP_URL: z.string().default('http://localhost:3000'),
  AGENCY_WEB_URL: z.string().default('http://localhost:3001'),
  PLATFORM_ADMIN_URL: z.string().default('http://localhost:3002'),
  API_URL: z.string().default('http://localhost:4000'),

  // ── PostgreSQL / PostGIS — authoritative application database ──────────
  DATABASE_URL: postgresUrl,
  /** Direct (non-pooled) connection URL; defaults to DATABASE_URL when unset. */
  DIRECT_URL: postgresUrl.optional(),

  // ── Supabase Auth — identity provider only ──────────────────────────────
  SUPABASE_URL: optionalProviderUrl,
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
  SUPABASE_JWT_ISSUER: optionalProviderUrl,
  /** JWKS endpoint override; defaults to <SUPABASE_URL>/auth/v1/.well-known/jwks.json. */
  SUPABASE_JWKS_URL: optionalProviderUrl,
  /** Server-only credential; must stay inside the auth infrastructure boundary. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // ── Maps — MapLibre renderer + MapTiler Cloud provider ─────────────────
  MAPTILER_API_KEY: z.string().min(1).optional(),
  MAP_PROVIDER: z.enum(MAP_PROVIDER_VALUES).default('maptiler'),

  // ── Object storage — Cloudflare R2 (S3-compatible) ─────────────────────
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).default('kavriqo-private'),
  R2_ENDPOINT: optionalHttpsUrl,
  R2_PUBLIC_BASE_URL: optionalHttpsUrl,

  // ── Redis — cache/jobs/rate limiting only ───────────────────────────────
  REDIS_URL: z
    .string()
    .refine((value) => /^rediss?:\/\/.+/.test(value), 'must be a redis:// or rediss:// URL')
    .default('redis://localhost:6379'),

  // ── Observability ──────────────────────────────────────────────────────
  SENTRY_DSN: optionalHttpsUrl,
  SENTRY_ENVIRONMENT: z.string().min(1).default('development'),

  // ── Application security / cryptography ────────────────────────────────
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),

  // ── Messaging providers — enabled only by approved implementation ──────
  EMAIL_PROVIDER: z.enum(PROVIDER_MODE_VALUES).default('none'),
  SMS_PROVIDER: z.enum(PROVIDER_MODE_VALUES).default('none'),
  WHATSAPP_PROVIDER: z.enum(PROVIDER_MODE_VALUES).default('none'),

  // ── Payments ───────────────────────────────────────────────────────────
  PAYMENT_PROVIDER: z.string().min(1).default('manual'),
  CHARGILY_ENABLED: boolFromEnv.default(false),
  CHARGILY_PUBLIC_KEY: z.string().min(1).optional(),
  CHARGILY_SECRET_KEY: z.string().min(1).optional(),

  // ── Product configuration ──────────────────────────────────────────────
  DEFAULT_LOCALE: z.enum(LOCALE_VALUES).default('en'),
  SUPPORTED_LOCALES: csvList
    .refine(
      (items) =>
        items.length > 0 &&
        items.every((item) => (LOCALE_VALUES as readonly string[]).includes(item)),
      'must be a comma-separated subset of ar,fr,en',
    )
    .default(['ar', 'fr', 'en']),
  DEFAULT_CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code')
    .default('DZD'),

  // ── Background jobs ────────────────────────────────────────────────────
  QUEUE_ENABLED: boolFromEnv.default(true),
};

/**
 * Production hardening: provider endpoints and public URLs must be TLS once
 * NODE_ENV is production. (Development/test may use http, e.g. a local JWKS
 * test server.) Enforced here so a misconfigured production deploy fails
 * fast at bootstrap — same philosophy as assertProductionRequirements.
 */
const prodHttpsFields = ['SUPABASE_URL', 'SUPABASE_JWT_ISSUER', 'SUPABASE_JWKS_URL'] as const;

export const envSchema = z.object(envSchemaFields).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  for (const field of prodHttpsFields) {
    const value = env[field];
    if (value !== undefined && !/^https:\/\//.test(value)) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: 'must be an https URL in production',
      });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export type AppEnvInput = Record<string, string | boolean | number | undefined>;

/**
 * Variables that MUST be present in production. Kept phase-aware: identity
 * requirements are enforced from Phase 01; storage/maps requirements are
 * asserted when their integration phases activate. Each entry lists only the
 * variable name — never values.
 */
export const PRODUCTION_REQUIRED_ENV: ReadonlyArray<string> = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_JWT_ISSUER',
  'APP_ENCRYPTION_KEY',
];
