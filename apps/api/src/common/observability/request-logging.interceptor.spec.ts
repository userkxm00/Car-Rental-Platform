import { ExecutionContext, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { runWithRequestContext } from './request-context';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

/** Typed access to the first argument of the first spy call. */
function firstCallArg(spy: jest.SpyInstance): unknown {
  const call = (spy.mock.calls as unknown as Array<[unknown]>)[0];
  expect(call).toBeDefined();
  return call?.[0];
}

function executionContext(method: string, path: string): ExecutionContext {
  const request = { method, originalUrl: path };
  const response = { statusCode: 200 };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('RequestLoggingInterceptor', () => {
  const interceptor = new RequestLoggingInterceptor();
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('logs method, path, status, duration and request ID for regular routes', () => {
    runWithRequestContext({ requestId: 'req-log-x', startedAt: 1 }, () => {
      interceptor
        .intercept(executionContext('GET', '/api/v1/vehicles'), { handle: () => of('ok') })
        .subscribe();
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const message = String(firstCallArg(logSpy));
    expect(message).toContain('GET /api/v1/vehicles 200');
    expect(message).toContain('ms');
    expect(message).toContain('requestId=req-log-x');
  });

  it('skips health probe endpoints to keep load-balancer noise out of logs', () => {
    runWithRequestContext({ requestId: 'req-probe', startedAt: 1 }, () => {
      interceptor
        .intercept(executionContext('GET', '/api/v1/health/live'), { handle: () => of('ok') })
        .subscribe();
    });
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the handler stream errors', () => {
    runWithRequestContext({ requestId: 'req-log-err', startedAt: 1 }, () => {
      interceptor
        .intercept(executionContext('POST', '/api/v1/bookings'), {
          handle: () => throwError(() => new Error('boom')),
        })
        .subscribe({ error: () => undefined });
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(firstCallArg(warnSpy));
    expect(message).toContain('POST /api/v1/bookings');
    expect(message).toContain('requestId=req-log-err');
  });

  it('passes non-HTTP contexts through untouched', () => {
    const nonHttp = { getType: () => 'rpc' } as unknown as ExecutionContext;
    interceptor.intercept(nonHttp, { handle: () => of('ok') }).subscribe();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
