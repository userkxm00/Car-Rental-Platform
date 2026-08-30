import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { api } from './http';

/**
 * Health endpoint e2e tests.
 *
 * The reachable-database suite expects a local PostgreSQL instance at the
 * URL below (see TESTING.md). The degraded suite overrides APP_ENV with an
 * unreachable URL and never touches a real database.
 */
const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';

describe('Health endpoints (e2e) — database reachable', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live returns 200 ok', async () => {
    const res = await api(app).get('/api/v1/health/live').expect(200);
    const body = res.body as { status: string; service: string; timestamp: string };
    expect(body).toMatchObject({ status: 'ok', service: 'kavriqo-api' });
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /api/v1/health/ready returns 200 ready', async () => {
    const res = await api(app).get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ready', checks: { database: 'up' } });
  });
});

describe('Health endpoints (e2e) — database unreachable', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(
        loadEnvSchema({
          DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:59999/unreachable',
        }),
      )
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live stays 200 while the database is down', async () => {
    await api(app).get('/api/v1/health/live').expect(200);
  });

  it('GET /api/v1/health/ready returns 503 with the documented envelope', async () => {
    const res = await api(app).get('/api/v1/health/ready').expect(503);
    const body = res.body as ApiErrorBody;
    expect(body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is not ready.',
        details: { database: 'down' },
      },
    });
  });
});
