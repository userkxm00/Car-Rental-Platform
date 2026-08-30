import { BadRequestException } from '@nestjs/common';
import { UserProfileService } from './user-profile.service';
import { UserProfile, UserRepository } from '../infrastructure/user.repository';

function fakeRepository(): {
  repository: UserRepository;
  updateMock: jest.Mock;
  profiles: Map<string, UserProfile>;
} {
  const profiles = new Map<string, UserProfile>();
  const base: UserProfile = {
    id: 'u-1',
    email: 'a@b.co',
    phone: null,
    displayName: 'a',
    preferredLocale: 'en',
    timezone: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  profiles.set('u-1', base);
  const updateMock = jest
    .fn()
    .mockImplementation(
      (
        userId: string,
        input: { displayName?: string; preferredLocale?: string; timezone?: string | null },
      ) => {
        const current = profiles.get(userId);
        if (!current) throw new Error('missing');
        const updated = { ...current, ...input, updatedAt: new Date('2026-01-02T00:00:00Z') };
        profiles.set(userId, updated);
        return Promise.resolve(updated);
      },
    );
  const repository = {
    getProfile: (userId: string) => Promise.resolve(profiles.get(userId)),
    updateProfile: updateMock,
  } as unknown as UserRepository;
  return { repository, updateMock, profiles };
}

describe('UserProfileService', () => {
  it('returns the caller profile', async () => {
    const { repository } = fakeRepository();
    const service = new UserProfileService(repository);
    await expect(service.getProfile('u-1')).resolves.toMatchObject({ id: 'u-1', email: 'a@b.co' });
  });

  it('rejects a missing account with USER_DISABLED', async () => {
    const { repository } = fakeRepository();
    const service = new UserProfileService(repository);
    await expect(service.getProfile('ghost')).rejects.toMatchObject({
      constructor: BadRequestException,
      response: { code: 'USER_DISABLED' },
    });
  });

  it('applies a valid partial update and reports changed fields', async () => {
    const { repository } = fakeRepository();
    const service = new UserProfileService(repository);
    const result = await service.updateProfile('u-1', {
      displayName: '  Ali Ben  ',
      preferredLocale: 'ar',
    });
    expect(result.changed).toEqual(['displayName', 'preferredLocale']);
    expect(result.updated.displayName).toBe('Ali Ben');
    expect(result.updated.preferredLocale).toBe('ar');
  });

  it('allows clearing the timezone with null', async () => {
    const { repository } = fakeRepository();
    const service = new UserProfileService(repository);
    const result = await service.updateProfile('u-1', { timezone: null });
    expect(result.updated.timezone).toBeNull();
  });

  it.each([
    ['displayName', { displayName: '' }, 'displayName'],
    ['displayName length', { displayName: 'x'.repeat(81) }, 'displayName'],
    ['locale', { preferredLocale: 'de' }, 'preferredLocale'],
    ['timezone shape', { timezone: 'not-a-zone' }, 'timezone'],
    ['timezone length', { timezone: `Africa/${'x'.repeat(64)}` }, 'timezone'],
  ])('rejects invalid %s input', async (_label, input, expectedField) => {
    const { repository } = fakeRepository();
    const service = new UserProfileService(repository);
    await expect(service.updateProfile('u-1', input)).rejects.toMatchObject({
      constructor: BadRequestException,
      response: { code: 'PROFILE_VALIDATION_FAILED' },
    });
    try {
      await service.updateProfile('u-1', input);
    } catch (error) {
      const details = (
        (error as BadRequestException).getResponse() as { details?: { failures: string[] } }
      ).details;
      expect(details?.failures.some((f) => f.startsWith(`${expectedField}:`))).toBe(true);
    }
  });

  it('rejects unknown fields', async () => {
    const { repository } = fakeRepository();
    const service = new UserProfileService(repository);
    await expect(service.updateProfile('u-1', { email: 'x@y.co' } as never)).rejects.toMatchObject({
      response: { code: 'PROFILE_VALIDATION_FAILED' },
    });
  });

  it('never updates the repository when validation fails', async () => {
    const { repository, updateMock } = fakeRepository();
    const service = new UserProfileService(repository);
    await expect(service.updateProfile('u-1', { preferredLocale: 'xx' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});
