import { Injectable } from '@nestjs/common';
import type { DocumentTemplate, DocumentTemplateVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PHASE-08 / 08-B persistence: template rows and their append-only
 * version releases. Versions are never updated or deleted — a release
 * adds new rows; the unique (templateId, locale, version) constraint is
 * the backstop against concurrent releases of the same number.
 */

export interface TemplateWithVersions extends DocumentTemplate {
  versions: DocumentTemplateVersion[];
}

@Injectable()
export class TemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string): Promise<TemplateWithVersions[]> {
    return this.prisma.documentTemplate.findMany({
      where: { tenantId },
      include: { versions: { orderBy: { version: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findInTenant(tenantId: string, templateId: string): Promise<TemplateWithVersions | null> {
    return this.prisma.documentTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
  }

  async findByCode(tenantId: string, code: string): Promise<TemplateWithVersions | null> {
    return this.prisma.documentTemplate.findUnique({
      where: { tenantId_code: { tenantId, code } },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
  }

  async createWithVersions(input: {
    tenantId: string;
    code: string;
    kind: 'RENTAL_CONTRACT';
    effectiveFrom: Date;
    versions: Array<{ locale: string; title: string; body: string }>;
  }): Promise<TemplateWithVersions> {
    return this.prisma.documentTemplate.create({
      data: {
        tenantId: input.tenantId,
        code: input.code,
        kind: input.kind,
        versions: {
          create: input.versions.map((version) => ({
            version: 1,
            locale: version.locale,
            title: version.title,
            body: version.body,
            effectiveFrom: input.effectiveFrom,
          })),
        },
      },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
  }

  async addVersions(input: {
    templateId: string;
    version: number;
    effectiveFrom: Date;
    versions: Array<{ locale: string; title: string; body: string }>;
  }): Promise<TemplateWithVersions> {
    return this.prisma.documentTemplate.update({
      where: { id: input.templateId },
      data: {
        versions: {
          create: input.versions.map((version) => ({
            version: input.version,
            locale: version.locale,
            title: version.title,
            body: version.body,
            effectiveFrom: input.effectiveFrom,
          })),
        },
      },
      include: { versions: { orderBy: { version: 'asc' } } },
    });
  }
}
