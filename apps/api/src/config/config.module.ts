import { Global, Module, Provider } from '@nestjs/common';
import {
  assertProductionRequirements,
  loadEnvSchema,
  PRODUCTION_REQUIRED_ENV,
} from '@kavriqo/config';
import { APP_ENV } from './app-env.token';

/**
 * Fail-fast typed configuration module.
 *
 * - Validates the complete environment schema at bootstrap (zod); an invalid
 *   or missing variable aborts startup with a message that references names
 *   only — never values.
 * - Production additionally refuses to boot without the secrets the current
 *   implementation phase requires (see PRODUCTION_REQUIRED_ENV).
 * - Consumers inject the {@link APP_ENV} token; provider credentials are only
 *   ever read inside infrastructure boundaries, never from clients.
 */
const appEnvProvider: Provider = {
  provide: APP_ENV,
  useFactory: () => {
    const env = loadEnvSchema(process.env);
    assertProductionRequirements(env, PRODUCTION_REQUIRED_ENV);
    return env;
  },
};

@Global()
@Module({
  providers: [appEnvProvider],
  exports: [APP_ENV],
})
export class ConfigModule {}
