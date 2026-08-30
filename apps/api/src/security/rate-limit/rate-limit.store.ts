/**
 * Rate-limit store port (01-E02).
 *
 * Redis becomes the rate-limit provider when its integration phase activates
 * (docs/provider-and-environment-contract.md — Redis = cache/jobs/rate
 * limits); the Phase 01 in-memory implementation behind this port keeps the
 * same contract and protects per-process.
 */
export interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

export abstract class RateLimitStore {
  /**
   * Increment and return the counter for a key within the current fixed
   * window. Implementations must be monotonic and prune expired windows.
   */
  abstract hit(key: string, windowMs: number): Promise<RateLimitEntry>;
}
