import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Tenant, TenantStatus, TenantVerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidTenantSlug, TenantErrorCode } from '../domain/tenant-errors';
import { canTransitionStatus, canTransitionVerification } from '../domain/tenant-lifecycle';

export interface CreateTenantInput {
  name: string;
  slug: string;
  legalName?: string;
  defaultLocale?: string;
  defaultTimezone?: string;
  defaultCurrency?: string;
}

export interface UpdateTenantSettingsInput {
  name?: string;
  legalName?: string | null;
  defaultLocale?: string;
  defaultTimezone?: string | null;
  defaultCurrency?: string;
}

/**
 * Tenant persistence (02-A02).
 *
 * The only place that writes the tenants table. Slug uniqueness is enforced
 * by the database (unique index) and mapped to a stable conflict code; the
 * repository additionally validates slug shape before touching the DB.
 */
@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTenantInput): Promise<Tenant> {
    this.assertSlugShape(input.slug);
    try {
      return await this.prisma.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          legalName: input.legalName ?? null,
          defaultLocale: input.defaultLocale ?? 'en',
          defaultTimezone: input.defaultTimezone ?? null,
          defaultCurrency: input.defaultCurrency ?? 'DZD',
          status: 'ACTIVE',
          marketplaceEnabled: false,
          verificationStatus: 'UNVERIFIED',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: TenantErrorCode.SLUG_TAKEN,
          message: 'This agency slug is already taken.',
        });
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Tenant | undefined> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    return tenant ?? undefined;
  }

  async findBySlug(slug: string): Promise<Tenant | undefined> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    return tenant ?? undefined;
  }

  async updateSettings(id: string, input: UpdateTenantSettingsInput): Promise<Tenant> {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale } : {}),
        ...(input.defaultTimezone !== undefined ? { defaultTimezone: input.defaultTimezone } : {}),
        ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency } : {}),
      },
    });
  }

  async setMarketplaceEnabled(id: string, enabled: boolean): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data: { marketplaceEnabled: enabled } });
  }

  async transitionStatus(id: string, to: TenantStatus): Promise<Tenant> {
    const current = await this.prisma.tenant.findUnique({ where: { id } });
    if (!current) {
      return this.missingTenant(id);
    }
    if (!canTransitionStatus(current.status, to)) {
      throw new ConflictException({
        code: TenantErrorCode.INVALID_STATUS_TRANSITION,
        message: `Tenant status cannot change from ${current.status} to ${to}.`,
      });
    }
    return this.prisma.tenant.update({ where: { id }, data: { status: to } });
  }

  async transitionVerification(id: string, to: TenantVerificationStatus): Promise<Tenant> {
    const current = await this.prisma.tenant.findUnique({ where: { id } });
    if (!current) {
      return this.missingTenant(id);
    }
    if (!canTransitionVerification(current.verificationStatus, to)) {
      throw new ConflictException({
        code: TenantErrorCode.INVALID_STATUS_TRANSITION,
        message: `Verification status cannot change from ${current.verificationStatus} to ${to}.`,
      });
    }
    return this.prisma.tenant.update({ where: { id }, data: { verificationStatus: to } });
  }

  private assertSlugShape(slug: string): void {
    if (!isValidTenantSlug(slug)) {
      throw new ConflictException({
        code: TenantErrorCode.TENANT_VALIDATION_FAILED,
        message: 'Slug must be 3-60 lowercase letters, digits or hyphens.',
      });
    }
  }

  private missingTenant(id: string): never {
    throw new ConflictException({
      code: TenantErrorCode.TENANT_NOT_FOUND,
      message: `Tenant ${id} not found.`,
    });
  }
}
