import { BadRequestException, Injectable } from '@nestjs/common';
import { IdentityErrorCode, SUPPORTED_LOCALES } from '../domain/identity-errors';
import { UserProfile, UserRepository } from '../infrastructure/user.repository';

export interface ProfileUpdateInput {
  displayName?: unknown;
  preferredLocale?: unknown;
  timezone?: unknown;
}

export interface ProfileUpdateResult {
  updated: UserProfile;
  changed: string[];
}

const DISPLAY_NAME_MAX = 80;
const TIMEZONE_MAX = 64;
/** IANA-style zone names: Area/Location, optionally with sub-regions. */
const TIMEZONE_SHAPE = /^[A-Za-z_+-]{1,32}(\/[A-Za-z0-9_+-]{1,32})+$/;

/**
 * User profile use-case (01-C06).
 *
 * - Retrieval exposes the user's own profile only (the caller's identity
 *   comes from the verified token via IdentityResolutionService).
 * - Update accepts displayName, preferredLocale (ar/fr/en) and timezone
 *   (IANA-style); unknown fields and invalid values are rejected with the
 *   documented validation envelope. Email/phone are never settable here —
 *   they follow provider-verified claims only.
 */
@Injectable()
export class UserProfileService {
  constructor(private readonly users: UserRepository) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.users.getProfile(userId);
    if (!profile) {
      // Verified identity without a stored application user: treat as gone.
      throw new BadRequestException({
        code: IdentityErrorCode.USER_DISABLED,
        message: 'Account record not found.',
      });
    }
    return profile;
  }

  async updateProfile(userId: string, input: ProfileUpdateInput): Promise<ProfileUpdateResult> {
    const parsed = this.parseUpdate(input);
    const updated = await this.users.updateProfile(userId, parsed);
    return { updated, changed: Object.keys(parsed) };
  }

  private parseUpdate(input: ProfileUpdateInput): {
    displayName?: string;
    preferredLocale?: string;
    timezone?: string | null;
  } {
    const failures: string[] = [];
    const parsed: { displayName?: string; preferredLocale?: string; timezone?: string | null } = {};

    const keys = Object.keys(input ?? {});
    for (const key of keys) {
      if (key !== 'displayName' && key !== 'preferredLocale' && key !== 'timezone') {
        failures.push(`${key}: unknown field`);
      }
    }

    if (input.displayName !== undefined) {
      if (typeof input.displayName !== 'string' || input.displayName.trim().length === 0) {
        failures.push('displayName: must be a non-empty string');
      } else if (input.displayName.trim().length > DISPLAY_NAME_MAX) {
        failures.push(`displayName: must be at most ${DISPLAY_NAME_MAX} characters`);
      } else {
        parsed.displayName = input.displayName.trim();
      }
    }

    if (input.preferredLocale !== undefined) {
      if (
        typeof input.preferredLocale !== 'string' ||
        !(SUPPORTED_LOCALES as readonly string[]).includes(input.preferredLocale)
      ) {
        failures.push('preferredLocale: must be one of ar, fr, en');
      } else {
        parsed.preferredLocale = input.preferredLocale;
      }
    }

    if (input.timezone !== undefined) {
      if (input.timezone === null) {
        parsed.timezone = null;
      } else if (
        typeof input.timezone !== 'string' ||
        !TIMEZONE_SHAPE.test(input.timezone) ||
        input.timezone.length > TIMEZONE_MAX
      ) {
        failures.push('timezone: must be an IANA-style zone name (e.g. Africa/Algiers)');
      } else {
        parsed.timezone = input.timezone;
      }
    }

    if (failures.length > 0) {
      throw new BadRequestException({
        code: IdentityErrorCode.PROFILE_VALIDATION_FAILED,
        message: 'Profile update contains invalid fields.',
        details: { failures },
      });
    }

    return parsed;
  }
}
