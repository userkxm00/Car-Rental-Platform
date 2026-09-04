import {
  assertProductionRequirements,
  EnvValidationError,
  loadEnvSchema,
  PRODUCTION_REQUIRED_ENV,
} from './index';

const VALID_DB_URL = 'postgresql://user:pass@localhost:5432/car_rental';

describe('loadEnvSchema', () => {
  it('accepts a minimal valid environment and applies documented defaults', () => {
    const env = loadEnvSchema({ NODE_ENV: 'development', DATABASE_URL: VALID_DB_URL });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.SUPPORTED_LOCALES).toEqual(['ar', 'fr', 'en']);
    expect(env.DEFAULT_LOCALE).toBe('en');
    expect(env.DEFAULT_CURRENCY).toBe('DZD');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.QUEUE_ENABLED).toBe(true);
  });

  it('rejects a non-PostgreSQL DATABASE_URL', () => {
    expect(() => loadEnvSchema({ DATABASE_URL: 'mysql://user:pass@host/db' })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects a missing required variable', () => {
    expect(() => loadEnvSchema({})).toThrow(EnvValidationError);
  });

  it('never includes environment values in error messages', () => {
    try {
      loadEnvSchema({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://TOP-SECRET-VALUE@host/db',
        APP_ENCRYPTION_KEY: 'short',
      });
      fail('expected EnvValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).not.toContain('TOP-SECRET-VALUE');
    }
  });

  it('parses environment booleans safely ("false" is false)', () => {
    const env = loadEnvSchema({
      DATABASE_URL: VALID_DB_URL,
      CHARGILY_ENABLED: 'false',
      QUEUE_ENABLED: 'false',
    });
    expect(env.CHARGILY_ENABLED).toBe(false);
    expect(env.QUEUE_ENABLED).toBe(false);
  });

  it('validates SUPPORTED_LOCALES against the ar/fr/en catalog', () => {
    expect(() => loadEnvSchema({ DATABASE_URL: VALID_DB_URL, SUPPORTED_LOCALES: 'ar,de' })).toThrow(
      EnvValidationError,
    );
  });

  it('validates the generated-document security knobs (08-D02/08-D04)', () => {
    const env = loadEnvSchema({
      DATABASE_URL: VALID_DB_URL,
      GENERATED_DOCUMENT_URL_TTL_SECONDS: '600',
      DOCUMENT_RETENTION_YEARS: '7',
    });
    expect(env.GENERATED_DOCUMENT_URL_TTL_SECONDS).toBe(600);
    expect(env.DOCUMENT_RETENTION_YEARS).toBe(7);

    expect(() =>
      loadEnvSchema({ DATABASE_URL: VALID_DB_URL, GENERATED_DOCUMENT_URL_TTL_SECONDS: '59' }),
    ).toThrow(EnvValidationError);
    expect(() =>
      loadEnvSchema({ DATABASE_URL: VALID_DB_URL, GENERATED_DOCUMENT_URL_TTL_SECONDS: '3601' }),
    ).toThrow(EnvValidationError);
    expect(() =>
      loadEnvSchema({ DATABASE_URL: VALID_DB_URL, DOCUMENT_RETENTION_YEARS: '0' }),
    ).toThrow(EnvValidationError);
    expect(() =>
      loadEnvSchema({ DATABASE_URL: VALID_DB_URL, DOCUMENT_RETENTION_YEARS: '31' }),
    ).toThrow(EnvValidationError);
  });

  it('validates DEFAULT_CURRENCY as a 3-letter code', () => {
    expect(() => loadEnvSchema({ DATABASE_URL: VALID_DB_URL, DEFAULT_CURRENCY: 'dzd' })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects invalid URLs for provider endpoints', () => {
    expect(() => loadEnvSchema({ DATABASE_URL: VALID_DB_URL, SUPABASE_URL: 'not-a-url' })).toThrow(
      EnvValidationError,
    );
  });

  it('accepts http provider endpoints outside production (local test providers)', () => {
    const env = loadEnvSchema({
      DATABASE_URL: VALID_DB_URL,
      SUPABASE_URL: 'http://localhost:4011',
      SUPABASE_JWT_ISSUER: 'http://localhost:4011/auth/v1',
      SUPABASE_JWKS_URL: 'http://localhost:4011/.well-known/jwks.json',
    });
    expect(env.SUPABASE_URL).toBe('http://localhost:4011');
  });

  it('enforces TLS on provider endpoints in production', () => {
    expect(() =>
      loadEnvSchema({
        NODE_ENV: 'production',
        DATABASE_URL: VALID_DB_URL,
        SUPABASE_URL: 'http://supabase.example.co',
        SUPABASE_JWT_ISSUER: 'https://supabase.example.co/auth/v1',
        APP_ENCRYPTION_KEY: 'k'.repeat(32),
      }),
    ).toThrow(/SUPABASE_URL/);
  });
});

describe('assertProductionRequirements', () => {
  it('passes when all production requirements are present', () => {
    const env = loadEnvSchema({
      NODE_ENV: 'production',
      DATABASE_URL: VALID_DB_URL,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_JWT_ISSUER: 'https://example.supabase.co/auth/v1',
      APP_ENCRYPTION_KEY: 'k'.repeat(32),
    });
    expect(() => assertProductionRequirements(env, PRODUCTION_REQUIRED_ENV)).not.toThrow();
  });

  it('fails fast when a production requirement is missing', () => {
    const env = loadEnvSchema({ NODE_ENV: 'production', DATABASE_URL: VALID_DB_URL });
    expect(() => assertProductionRequirements(env, PRODUCTION_REQUIRED_ENV)).toThrow(
      /missing required variable\(s\): SUPABASE_URL, SUPABASE_JWT_ISSUER, APP_ENCRYPTION_KEY/,
    );
  });

  it('does not apply outside production', () => {
    const env = loadEnvSchema({ NODE_ENV: 'development', DATABASE_URL: VALID_DB_URL });
    expect(() => assertProductionRequirements(env, PRODUCTION_REQUIRED_ENV)).not.toThrow();
  });
});
