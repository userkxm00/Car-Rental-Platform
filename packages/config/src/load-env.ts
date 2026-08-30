import { EnvValidationError } from './env-error';
import { AppEnv, AppEnvInput, envSchema } from './env-schema';

/**
 * Parse and validate the environment configuration.
 *
 * Provider-neutral by design: any environment mechanism that can produce a
 * plain record (process.env, a secret manager adapter, a .env file loader)
 * can feed this function. On failure it throws {@link EnvValidationError}
 * whose message references variable names only — never values.
 */
export function loadEnvSchema(input: AppEnvInput = process.env): AppEnv {
  const result = envSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
  throw new EnvValidationError(issues);
}

/**
 * Fail-fast guard for production: refuses to boot when a variable required
 * for safe production operation is missing. Development/test/staging remain
 * flexible so provider integrations can be introduced phase by phase.
 */
export function assertProductionRequirements(
  env: AppEnv,
  required: ReadonlyArray<string> = [],
): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  const missing = required.filter((key) => {
    const value = (env as unknown as Record<string, unknown>)[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    throw new EnvValidationError(['production configuration incomplete'], missing);
  }
}
