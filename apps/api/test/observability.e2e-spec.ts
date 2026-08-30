import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { api } from './http';

describe('Correlation ID (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/unreachable';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('echoes the inbound X-Request-ID on the response', async () => {
    const res = await api(app)
      .get('/api/v1/health/live')
      .set('X-Request-ID', 'echo-me-1')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('echo-me-1');
  });

  it('generates a UUID X-Request-ID when none is provided', async () => {
    const res = await api(app).get('/api/v1/health/live').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects unsafe inbound IDs and replaces them with a UUID', async () => {
    const res = await api(app)
      .get('/api/v1/health/live')
      .set('X-Request-ID', 'unsafe id with spaces')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('attaches the request ID to error envelopes as well', async () => {
    const res = await api(app).get('/api/v1/nope').set('X-Request-ID', 'err-ctx-1').expect(404);
    const body = res.body as { error: { requestId?: string } };
    expect(body.error.requestId).toBe('err-ctx-1');
  });
});
