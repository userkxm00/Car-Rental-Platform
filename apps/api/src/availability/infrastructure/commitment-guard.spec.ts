import {
  IntervalConflictError,
  isExclusionViolation,
  isRetryableCommitmentError,
  withVehicleCommitmentLock,
} from './commitment-guard';

/**
 * Lock/retry strategy tests (04-B04/04-B07): serialization failures and
 * deadlocks retry exactly once; exclusion violations translate to
 * INTERVAL_CONFLICT without retrying; unrelated errors propagate untouched.
 */
interface FakePrisma {
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  attempts: () => number;
}

const fakeTx = { $queryRaw: () => Promise.resolve([]) };

function makeFakePrisma(attemptImpls: Array<() => Promise<unknown>>): FakePrisma {
  let attempts = 0;
  return {
    attempts: () => attempts,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const impl = attemptImpls[Math.min(attempts, attemptImpls.length - 1)];
      attempts += 1;
      const tx = await impl();
      return fn(tx);
    },
  };
}

describe('withVehicleCommitmentLock retry strategy', () => {
  it('retries exactly once on serialization failure and returns the action result', async () => {
    const action = jest.fn().mockResolvedValue('committed');
    const fake = makeFakePrisma([
      () => Promise.reject(Object.assign(new Error('serialization failure'), { code: '40001' })),
      () => Promise.resolve(fakeTx),
    ]);

    const result = await withVehicleCommitmentLock(fake as never, 'vehicle-1', action as never);

    expect(result).toBe('committed');
    expect(action).toHaveBeenCalledTimes(1);
    expect(fake.attempts()).toBe(2);
  });

  it('retries once on deadlock', async () => {
    const action = jest.fn().mockResolvedValue('committed');
    const fake = makeFakePrisma([
      () => Promise.reject(Object.assign(new Error('deadlock detected'), { code: '40P01' })),
      () => Promise.resolve(fakeTx),
    ]);

    await withVehicleCommitmentLock(fake as never, 'vehicle-1', action as never);
    expect(fake.attempts()).toBe(2);
  });

  it('translates database exclusion violations to INTERVAL_CONFLICT without retrying', async () => {
    const action = jest.fn();
    const fake = makeFakePrisma([
      () =>
        Promise.reject(
          Object.assign(
            new Error('conflicting key value violates exclusion constraint "booking_holds_no_overlap"'),
            { code: '23P01' },
          ),
        ),
    ]);

    await expect(
      withVehicleCommitmentLock(fake as never, 'vehicle-1', action as never),
    ).rejects.toBeInstanceOf(IntervalConflictError);
    expect(action).not.toHaveBeenCalled();
    expect(fake.attempts()).toBe(1);
  });

  it('propagates unrelated errors unchanged and never retries them', async () => {
    const action = jest.fn();
    const boom = new Error('connection lost');
    const fake = makeFakePrisma([() => Promise.reject(boom)]);

    await expect(
      withVehicleCommitmentLock(fake as never, 'vehicle-1', action as never),
    ).rejects.toBe(boom);
    expect(action).not.toHaveBeenCalled();
    expect(fake.attempts()).toBe(1);
  });

  it('classifies retryable and exclusion codes correctly', () => {
    expect(isRetryableCommitmentError({ code: '40001' })).toBe(true);
    expect(isRetryableCommitmentError({ code: '40P01' })).toBe(true);
    expect(isRetryableCommitmentError({ code: '23P01' })).toBe(false);
    expect(isExclusionViolation({ code: '23P01' })).toBe(true);
    expect(isExclusionViolation(new Error('nope'))).toBe(false);
  });
});
