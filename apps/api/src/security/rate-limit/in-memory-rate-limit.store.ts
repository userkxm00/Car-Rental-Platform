import { Injectable } from '@nestjs/common';
import { RateLimitEntry, RateLimitStore } from './rate-limit.store';

const MAX_KEYS = 20_000;

/**
 * Fixed-window in-memory rate limiter (01-E02).
 *
 * Per-process protection until the Redis-backed store replaces it in the
 * cache/jobs phase; the port contract stays identical.
 */
@Injectable()
export class InMemoryRateLimitStore extends RateLimitStore {
  private readonly windows = new Map<string, RateLimitEntry>();

  override hit(key: string, windowMs: number): Promise<RateLimitEntry> {
    const now = Date.now();
    const current = this.windows.get(key);
    if (!current || now - current.windowStartedAt >= windowMs) {
      this.windows.set(key, { count: 1, windowStartedAt: now });
      if (this.windows.size > MAX_KEYS) {
        this.prune(now, windowMs);
      }
      return Promise.resolve({ count: 1, windowStartedAt: now });
    }
    current.count += 1;
    return Promise.resolve(current);
  }

  private prune(now: number, windowMs: number): void {
    for (const [key, entry] of this.windows) {
      if (now - entry.windowStartedAt >= windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
