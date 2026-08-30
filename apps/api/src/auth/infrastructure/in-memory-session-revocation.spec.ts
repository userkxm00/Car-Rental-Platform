import { InMemorySessionRevocationBoundary } from './in-memory-session-revocation';

describe('InMemorySessionRevocationBoundary (01-E01)', () => {
  it('does not flag unrevoked principals', async () => {
    const boundary = new InMemorySessionRevocationBoundary();
    await expect(
      boundary.isRevoked({ subject: 'u-1', emailVerified: true, sessionId: 's-1' }),
    ).resolves.toBe(false);
  });

  it('flags a revoked session by session ID', async () => {
    const boundary = new InMemorySessionRevocationBoundary();
    await boundary.revoke({ subject: 'u-1', sessionId: 's-1' });
    await expect(
      boundary.isRevoked({ subject: 'u-1', emailVerified: true, sessionId: 's-1' }),
    ).resolves.toBe(true);
  });

  it('flags every session of a revoked subject when no session ID is asserted', async () => {
    const boundary = new InMemorySessionRevocationBoundary();
    await boundary.revoke({ subject: 'u-2' });
    await expect(
      boundary.isRevoked({ subject: 'u-2', emailVerified: true, sessionId: 'other' }),
    ).resolves.toBe(true);
  });

  it('stays bounded when heavily loaded', async () => {
    const boundary = new InMemorySessionRevocationBoundary();
    for (let i = 0; i < 15_000; i += 1) {
      await boundary.revoke({ subject: `u-${i}`, sessionId: `s-${i}` });
    }
    // No crash; the registry remains consultable.
    await expect(
      boundary.isRevoked({ subject: 'u-1', emailVerified: true, sessionId: 's-1' }),
    ).resolves.toBe(true);
  });
});
