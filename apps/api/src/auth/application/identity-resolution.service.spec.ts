import { ForbiddenException } from '@nestjs/common';
import { IdentityResolutionService } from './identity-resolution.service';
import { InMemoryIdentityStore } from '../infrastructure/in-memory-identity-store';
import type { VerifiedPrincipal } from '../ports/auth-provider.port';

const principal = (overrides: Partial<VerifiedPrincipal> = {}): VerifiedPrincipal => ({
  subject: 'provider-sub-1',
  email: 'user@example.com',
  emailVerified: true,
  ...overrides,
});

describe('IdentityResolutionService', () => {
  let store: InMemoryIdentityStore;
  let service: IdentityResolutionService;

  beforeEach(() => {
    store = new InMemoryIdentityStore();
    service = new IdentityResolutionService(store);
  });

  it('resolves a known provider subject to its application user ID', async () => {
    const first = await service.resolve(principal());
    const second = await service.resolve(principal());
    expect(second).toBe(first);
  });

  it('provisions an unknown subject from verified claims (idempotent)', async () => {
    const userId = await service.resolve(principal());
    expect(userId).toMatch(/^user-/);
    const record = await store.findByProviderSubject('provider-sub-1');
    expect(record?.email).toBe('user@example.com');
    expect(record?.emailVerified).toBe(true);
  });

  it('provisions identity even when email is absent from the token (subject is verified)', async () => {
    const userId = await service.resolve(principal({ email: undefined, emailVerified: false }));
    expect(userId).toMatch(/^user-/);
    const record = await store.findByProviderSubject('provider-sub-1');
    expect(record?.email).toBeNull();
    expect(record?.emailVerified).toBe(false);
  });

  it('rejects SUSPENDED application identities with 403 USER_DISABLED', async () => {
    await service.resolve(principal());
    store.setStatus('provider-sub-1', 'SUSPENDED');
    await expect(service.resolve(principal())).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: 'USER_DISABLED' },
    });
  });

  it('rejects DEACTIVATED application identities', async () => {
    await service.resolve(principal());
    store.setStatus('provider-sub-1', 'DEACTIVATED');
    await expect(service.resolve(principal())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not resurrect a suspended user through re-provisioning', async () => {
    await service.resolve(principal());
    store.setStatus('provider-sub-1', 'SUSPENDED');
    await expect(service.resolve(principal())).rejects.toBeInstanceOf(ForbiddenException);
    // A second attempt must fail the same way, not create a new user.
    await expect(service.resolve(principal())).rejects.toBeInstanceOf(ForbiddenException);
    expect(await store.findByProviderSubject('provider-sub-1')).toMatchObject({
      status: 'SUSPENDED',
    });
  });
});
