import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Typed supertest client for Nest e2e tests.
 *
 * Nest's getHttpServer() returns `any`; this narrows it once through
 * `unknown` so strict type-aware linting applies everywhere else in the
 * suite.
 */
export function api(app: INestApplication): ReturnType<typeof request> {
  const httpServer: unknown = app.getHttpServer();
  return request(httpServer as Parameters<typeof request>[0]);
}
