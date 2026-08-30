import { StructuredLogger, sanitize } from './structured-logger';
import { runWithRequestContext } from './request-context';

function captureStream(stream: 'stdout' | 'stderr', fn: () => void): string {
  const target = stream === 'stdout' ? process.stdout : process.stderr;
  const chunks: string[] = [];
  const spy = jest.spyOn(target, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join('');
}

function captureAll(fn: () => void): string {
  return `${captureStream('stdout', fn)}${captureStream('stderr', fn)}`;
}

describe('StructuredLogger', () => {
  it('emits one parseable JSON line per message in production mode', () => {
    const output = captureAll(() => {
      new StructuredLogger({ nodeEnv: 'production' }).log('hello world', 'TestContext');
    });
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(parsed.level).toBe('log');
    expect(parsed.context).toBe('TestContext');
    expect(parsed.message).toBe('hello world');
    expect(parsed.requestId).toBeNull();
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('includes the correlation ID from the active request context', () => {
    const output = captureAll(() => {
      runWithRequestContext({ requestId: 'req-log-42', startedAt: 1 }, () => {
        new StructuredLogger({ nodeEnv: 'production' }).warn('something', 'Ctx');
      });
    });
    const parsed = JSON.parse(output.trim().split('\n')[0] ?? '{}') as Record<string, unknown>;
    expect(parsed.requestId).toBe('req-log-42');
  });

  it('redacts sensitive object keys before serialization', () => {
    const output = captureAll(() => {
      new StructuredLogger({ nodeEnv: 'production' }).log(
        { user: 'alice', password: 's3cr3t', nested: { authorization: 'Bearer tok' } },
        'Ctx',
      );
    });
    expect(output).not.toContain('s3cr3t');
    expect(output).not.toContain('Bearer tok');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('alice');
  });

  it('serializes errors safely with name, message and stack', () => {
    const output = captureAll(() => {
      new StructuredLogger({ nodeEnv: 'production' }).error(new TypeError('boom'), 'Ctx');
    });
    const parsed = JSON.parse(output.trim().split('\n')[0] ?? '{}') as Record<string, unknown>;
    expect(String(parsed.message)).toContain('TypeError: boom');
    expect(String(parsed.message)).toContain('structured-logger.spec.ts');
  });

  it('uses human-readable output in development mode', () => {
    const output = captureAll(() => {
      new StructuredLogger({ nodeEnv: 'development' }).log('dev line', 'Ctx');
    });
    expect(output).toContain('dev line');
    expect(() => {
      JSON.parse(output.trim());
    }).toThrow();
  });
});

describe('sanitize', () => {
  it('handles circular structures without throwing', () => {
    const circular: Record<string, unknown> = { name: 'a' };
    circular.self = circular;
    const result = sanitize(circular) as Record<string, unknown>;
    expect(result.self).toBe('[Circular]');
  });

  it('redacts by key pattern regardless of nesting', () => {
    const result = sanitize({ a: { SERVICE_ROLE_KEY: 'x' }, list: [{ token: 'y' }] }) as {
      a: Record<string, unknown>;
      list: Array<Record<string, unknown>>;
    };
    expect(result.a.SERVICE_ROLE_KEY).toBe('[REDACTED]');
    expect(result.list[0]?.token).toBe('[REDACTED]');
  });
});
