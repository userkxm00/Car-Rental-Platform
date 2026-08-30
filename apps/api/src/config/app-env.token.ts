import type { InjectionToken } from '@nestjs/common';
import type { AppEnv } from '@kavriqo/config';

/**
 * Typed, validated application environment.
 *
 * Provided once at bootstrap by {@link ConfigModule}; inject this token
 * instead of reading process.env inside services. Never serialize it.
 */
export const APP_ENV: InjectionToken<AppEnv> = Symbol.for('KAVRIQO_APP_ENV');
