import { Injectable } from '@nestjs/common';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type { VerifiedPrincipal } from '../../auth/ports/auth-provider.port';
import { ApplicationUserRecord } from '../../auth/ports/identity-store.port';
import { IdentityErrorCode } from '../domain/identity-errors';
import { PrismaService } from '../prisma/prisma.service';

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  preferredLocale: string;
  timezone: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User persistence (01-C02).
 *
 * The only place that reads/writes the users and user_identities tables.
 * Uniqueness violations are mapped to stable conflict codes (01-C05); the
 * provider-subject → user link is enforced as the composite unique key on
 * user_identities (01-C07 consistency).
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserProfile | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ?? undefined;
  }

  async findByProviderSubject(subject: string): Promise<ApplicationUserRecord | undefined> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'supabase', providerSubject: subject } },
      include: { user: true },
    });
    if (!identity) {
      return undefined;
    }
    return toApplicationUserRecord(identity.user);
  }

  /**
   * Provision an application user from verified claims (01-C03).
   *
   * Idempotent per provider subject: an existing link is returned as-is and
   * never re-provisioned. The application user starts ACTIVE with the
   * verified email (when asserted) and default locale. A verified email that
   * already belongs to another application user is a conflict — the platform
   * never silently merges identities.
   */
  async provisionFromPrincipal(principal: VerifiedPrincipal): Promise<ApplicationUserRecord> {
    const existing = await this.findByProviderSubject(principal.subject);
    if (existing) {
      return existing;
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          // Only provider-VERIFIED emails are persisted (01-B04 invariant:
          // never provision identity data from unverified claims).
          email: principal.emailVerified ? (principal.email ?? null) : null,
          displayName: deriveDisplayName(principal),
          preferredLocale: 'en',
          status: 'ACTIVE',
          identities: {
            create: {
              provider: 'supabase',
              providerSubject: principal.subject,
            },
          },
        },
        include: { identities: true },
      });
      return toApplicationUserRecord(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // The subject link won the race (another request provisioned it):
          // resolve it instead of failing. Any other unique violation (an
          // email already owned by another user) stays a conflict.
          const raced = await this.findByProviderSubject(principal.subject);
          if (raced) {
            return raced;
          }
          throw new ConflictException({
            code: IdentityErrorCode.EMAIL_TAKEN,
            message: 'This verified email already belongs to another account.',
          });
        }
      }
      throw new InternalServerErrorException({
        code: 'INTERNAL_ERROR',
        message: 'Identity provisioning failed.',
      });
    }
  }

  async updateStatus(userId: string, status: UserStatus): Promise<ApplicationUserRecord> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status } });
    return toApplicationUserRecord(user);
  }

  async getProfile(userId: string): Promise<UserProfile | undefined> {
    return this.findById(userId);
  }

  async updateProfile(
    userId: string,
    input: { displayName?: string; preferredLocale?: string; timezone?: string | null },
  ): Promise<UserProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.preferredLocale !== undefined ? { preferredLocale: input.preferredLocale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });
    return user;
  }
}

function toApplicationUserRecord(user: {
  id: string;
  email: string | null;
  status: UserStatus;
}): ApplicationUserRecord {
  // Only provider-verified emails are persisted (see provisionFromPrincipal),
  // so a stored email implies verification at provisioning time. Trust at
  // request time is established by token verification (01-B), not by this row.
  return {
    userId: user.id,
    status: user.status,
    email: user.email,
    emailVerified: user.email !== null,
  };
}

function deriveDisplayName(principal: VerifiedPrincipal): string {
  // Only verified claims feed identity data (01-B04); the default display
  // name is the verified email's local part, falling back to a neutral value.
  if (principal.emailVerified && principal.email) {
    const localPart = principal.email.split('@')[0];
    if (localPart && localPart.length <= 80) {
      return localPart;
    }
  }
  return 'User';
}
