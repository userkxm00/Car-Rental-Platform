import { currentRequestContext, currentRequestId, runWithRequestContext } from './request-context';

describe('request-context (AsyncLocalStorage)', () => {
  it('is undefined outside a request context', () => {
    expect(currentRequestId()).toBeUndefined();
  });

  it('propagates the request ID across async boundaries', async () => {
    await runWithRequestContext({ requestId: 'req-1', startedAt: 1 }, async () => {
      await Promise.resolve();
      expect(currentRequestId()).toBe('req-1');
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(currentRequestId()).toBe('req-1');
    });
    expect(currentRequestId()).toBeUndefined();
  });

  it('supports nested contexts without leaking', () => {
    runWithRequestContext({ requestId: 'outer', startedAt: 1 }, () => {
      expect(currentRequestContext()?.requestId).toBe('outer');
      runWithRequestContext({ requestId: 'inner', startedAt: 2 }, () => {
        expect(currentRequestContext()?.requestId).toBe('inner');
      });
      expect(currentRequestContext()?.requestId).toBe('outer');
    });
  });
});
