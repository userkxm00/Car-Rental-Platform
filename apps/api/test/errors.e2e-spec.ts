import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Public } from '../src/auth/auth.guard';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { api } from './http';

/** Test-only controller that throws an unexpected (non-HttpException) error. */
@Public()
@Controller('boom')
class BoomController {
  @Get()
  boom(): never {
    throw new TypeError('secret internal detail — must never reach the client');
  }
}

describe('Routing baseline & error envelope (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/unreachable';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('unknown /api/v1 route returns the documented 404 envelope', async () => {
    const res = await api(app).get('/api/v1/unknown').expect(404);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });

  it('echoes the X-Request-ID header in the error envelope', async () => {
    const res = await api(app).get('/api/v1/unknown').set('X-Request-ID', 'req-echo-1').expect(404);
    const body = res.body as ApiErrorBody;
    expect(body.error.requestId).toBe('req-echo-1');
  });

  it('unsupported version /api/v2 is a 404, not a fallback to v1', async () => {
    const res = await api(app).get('/api/v2/health/live').expect(404);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('unversioned /api and root / are 404s', async () => {
    await api(app).get('/api').expect(404);
    await api(app).get('/').expect(404);
  });

  it('masks unexpected internal errors behind INTERNAL_ERROR', async () => {
    const res = await api(app).get('/api/v1/boom').expect(500);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
  });
});
