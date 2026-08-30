import { CorrelationMiddleware, REQUEST_ID_HEADER } from './correlation.middleware';
import { currentRequestId } from './request-context';

type Callback = () => void;

function runMiddleware(
  middleware: CorrelationMiddleware,
  inbound?: string,
): { responseHeaders: Record<string, string | string[] | undefined>; observedRequestId?: string } {
  let observedRequestId: string | undefined;
  const responseHeaders: Record<string, string | string[] | undefined> = {};

  middleware.use(
    { headers: inbound ? { [REQUEST_ID_HEADER]: inbound } : {} } as never,
    {
      setHeader: (name: string, value: string) => {
        responseHeaders[name] = value;
      },
    } as never,
    (() => {
      observedRequestId = currentRequestId();
    }) as Callback,
  );

  return { responseHeaders, observedRequestId };
}

describe('CorrelationMiddleware', () => {
  const middleware = new CorrelationMiddleware();

  it('honors a well-formed inbound X-Request-ID', () => {
    const { responseHeaders, observedRequestId } = runMiddleware(middleware, 'req-abc-123');
    expect(responseHeaders[REQUEST_ID_HEADER]).toBe('req-abc-123');
    expect(observedRequestId).toBe('req-abc-123');
  });

  it('generates a UUID when no inbound ID is present', () => {
    const { responseHeaders, observedRequestId } = runMiddleware(middleware);
    expect(responseHeaders[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
    expect(observedRequestId).toBe(responseHeaders[REQUEST_ID_HEADER]);
  });

  it('rejects unsafe inbound values (log-injection guard) and generates a UUID', () => {
    for (const unsafe of [
      'bad id with spaces',
      'x\nEVIL',
      'x'.repeat(200),
      '${jndi:ldap://evil}',
    ]) {
      const { responseHeaders, observedRequestId } = runMiddleware(middleware, unsafe);
      expect(responseHeaders[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
      expect(responseHeaders[REQUEST_ID_HEADER]).not.toContain('EVIL');
      expect(observedRequestId).toBe(responseHeaders[REQUEST_ID_HEADER]);
    }
  });

  it('does not leak the request ID outside the request scope', () => {
    runMiddleware(middleware, 'req-scope-check');
    expect(currentRequestId()).toBeUndefined();
  });
});
