import { INestApplication, VersioningType } from '@nestjs/common';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { CorrelationMiddleware } from './common/observability/correlation.middleware';
import { RequestLoggingInterceptor } from './common/observability/request-logging.interceptor';

/**
 * Single source of truth for global application wiring.
 *
 * Both `main.ts` (production boot) and the e2e test harness call this so the
 * tested application is the deployed application.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const correlation = new CorrelationMiddleware();
  app.use(correlation.use.bind(correlation));
}
