import { inspect } from 'node:util';
import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { currentRequestId } from './request-context';

/**
 * Keys that must never appear in log output. Values under these keys are
 * replaced with [REDACTED] before serialization.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|api[-_]?key|service[-_]?role|private[-_]?key|cookie)/i;

/**
 * Structured application logger.
 *
 * - production/test JSON output: one JSON object per line with timestamp,
 *   level, context, requestId and message — machine-parseable.
 * - development: human-readable colored output.
 * - Objects are sanitized before serialization: sensitive keys are redacted
 *   and circular structures degrade to a safe fallback instead of throwing.
 */
export class StructuredLogger extends ConsoleLogger {
  constructor(options?: { nodeEnv?: string; timestamps?: boolean }) {
    super({
      timestamp: options?.timestamps ?? true,
      logLevels: allLogLevels(),
    });
    const nodeEnv = options?.nodeEnv ?? 'development';
    this.jsonMode = ['production', 'staging', 'test'].includes(nodeEnv);
  }

  private readonly jsonMode: boolean;

  protected override printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
  ): void {
    const requestId = currentRequestId();
    const payload = {
      level: logLevel,
      timestamp: new Date().toISOString(),
      context,
      requestId: requestId ?? null,
      message: messages
        .map((message) => this.serialize(message))
        .filter((message): message is string => message !== undefined)
        .join(' '),
    };

    const output = this.jsonMode ? JSON.stringify(payload) : formatHuman(payload);

    const target = writeStreamType === 'stderr' ? process.stderr : process.stdout;
    target.write(`${output}\n`);
  }

  /** Serialize a single log argument without throwing and without secrets. */
  private serialize(message: unknown): string | undefined {
    if (message === null || message === undefined) {
      return undefined;
    }
    if (
      typeof message === 'string' ||
      typeof message === 'number' ||
      typeof message === 'boolean'
    ) {
      return String(message);
    }
    if (message instanceof Error) {
      return `${message.name}: ${message.message}` + (message.stack ? `\n${message.stack}` : '');
    }
    try {
      return JSON.stringify(sanitize(message));
    } catch {
      return inspect(message);
    }
  }
}

function allLogLevels(): LogLevel[] {
  return ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];
}

/** Deep-redact sensitive keys; cycle-safe. */
export function sanitize(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitize(item, seen);
    }
  }
  return result;
}

const LEVEL_COLORS: Record<string, string> = {
  log: '\u001b[32m',
  error: '\u001b[31m',
  warn: '\u001b[33m',
  debug: '\u001b[35m',
  verbose: '\u001b[36m',
  fatal: '\u001b[31m',
};
const RESET = '\u001b[0m';

function formatHuman(payload: {
  level: string;
  timestamp: string;
  context: string;
  requestId: string | null;
  message: string;
}): string {
  const color = LEVEL_COLORS[payload.level] ?? RESET;
  const prefix = `${payload.timestamp} ${color}${payload.level.toUpperCase()}${RESET} [${payload.context}]`;
  const requestId = payload.requestId ? ` [req=${payload.requestId}]` : '';
  return `${prefix}${requestId} ${payload.message}`;
}
