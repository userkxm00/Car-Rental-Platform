import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentTemplateVersion } from '@prisma/client';
import {
  DEFAULT_TEMPLATE_CONTENT,
  isTemplateLocale,
  selectTemplateVersion,
  sampleTemplateValues,
  substituteTemplate,
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_CODE_PATTERN,
  TEMPLATE_KIND,
  TEMPLATE_TITLE_MAX_LENGTH,
  unknownTemplateVariables,
  type TemplateLocale,
  type TemplateValues,
} from '../domain/template-rules';
import {
  TemplatesErrorCode,
  type RenderTemplateInput,
  type RenderedTemplateVersion,
  type TemplateAddVersionInput,
  type TemplateCreateInput,
  type TemplateListResponse,
  type TemplatePreviewInput,
  type TemplatePreviewResponse,
  type TemplateResponse,
} from '../domain/templates.contract';
import { TemplatesRepository } from '../infrastructure/templates.repository';

/**
 * PHASE-08 / 08-B use-cases: template CRUD with append-only releases
 * (08-B01/08-B02), the built-in ar/fr/en defaults (08-B03..B05),
 * whitelisted variable substitution (08-B06) and the effective-date
 * version selection rules (08-B07). Versions are immutable once
 * released — contract reproducibility depends on it (docs/06).
 */

interface NormalizedVersion {
  locale: TemplateLocale;
  title: string;
  body: string;
}

@Injectable()
export class TemplatesService {
  constructor(private readonly repository: TemplatesRepository) {}

  /** 08-B01: the agency's templates or the built-in defaults. */
  async list(tenantId: string): Promise<TemplateListResponse> {
    const templates = await this.repository.listForTenant(tenantId);
    const now = new Date();
    return {
      templates: templates.map((template) => this.toSummary(template, now)),
      builtInLocales: [...(Object.keys(DEFAULT_TEMPLATE_CONTENT) as TemplateLocale[])],
      configured: templates.length > 0,
    };
  }

  async get(tenantId: string, templateId: string): Promise<TemplateResponse> {
    const template = await this.requireTemplate(tenantId, templateId);
    return this.toResponse(template);
  }

  /** 08-B01: create the logical template with its first release (v1). */
  async create(tenantId: string, input: TemplateCreateInput): Promise<TemplateResponse> {
    const code = this.parseCode(input.code);
    const effectiveFrom = this.parseEffectiveFrom(input.effectiveFrom);
    const versions = this.parseVersions(input.versions);
    const existing = await this.repository.findByCode(tenantId, code);
    if (existing) {
      throw new ConflictException({
        code: TemplatesErrorCode.TEMPLATE_CODE_EXISTS,
        message: 'A template with this code already exists for the agency.',
      });
    }
    const created = await this.repository.createWithVersions({
      tenantId,
      code,
      kind: TEMPLATE_KIND,
      effectiveFrom,
      versions,
    });
    return this.toResponse(created);
  }

  /** 08-B02: release the next version (append-only, never updates). */
  async addVersion(tenantId: string, templateId: string, input: TemplateAddVersionInput): Promise<TemplateResponse> {
    const template = await this.requireTemplate(tenantId, templateId);
    const effectiveFrom = this.parseEffectiveFrom(input.effectiveFrom);
    const versions = this.parseVersions(input.versions);
    const nextVersion = template.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const updated = await this.repository.addVersions({
      templateId: template.id,
      version: nextVersion,
      effectiveFrom,
      versions,
    });
    return this.toResponse(updated);
  }

  /** 08-B06/08-B07: render the effective version for a locale and date. */
  async preview(tenantId: string, input: TemplatePreviewInput): Promise<TemplatePreviewResponse> {
    const locale = this.parseLocale(input.locale);
    const asOf = this.parseEffectiveFrom(input.asOf);
    const values = this.parseValues(input.variables);

    const requestedId = this.parseOptionalUuid(input.templateId);
    let template = null;
    if (requestedId) {
      template = await this.repository.findInTenant(tenantId, requestedId);
      if (!template) {
        throw new NotFoundException({
          code: TemplatesErrorCode.TEMPLATE_NOT_FOUND,
          message: 'Template not found in this agency.',
        });
      }
    } else {
      const templates = await this.repository.listForTenant(tenantId);
      template = templates[0] ?? null;
    }
    if (template) {
      const selected = selectTemplateVersion(template.versions, locale, asOf);
      if (!selected) {
        throw new ConflictException({
          code: TemplatesErrorCode.TEMPLATE_VERSION_MISSING,
          message: 'No template version is effective for the requested locale and date.',
        });
      }
      const rendered = this.renderBody(selected.version.body, values, selected.locale);
      return {
        locale: selected.locale as TemplateLocale,
        fallback: selected.fallback,
        version: selected.version.version,
        title: selected.version.title,
        body: rendered,
      };
    }

    // Built-in defaults: content exists for every supported locale.
    const builtIn = DEFAULT_TEMPLATE_CONTENT[locale] ?? DEFAULT_TEMPLATE_CONTENT.ar;
    return {
      locale,
      fallback: false,
      version: null,
      title: builtIn.title,
      body: this.renderBody(builtIn.body, values, locale),
    };
  }

  /**
   * 08-B07 for the contract workflow (08-C): the effective version for
   * the agency's template code, or the built-in content when the agency
   * never released its own. Returns the exact source rendered so the
   * contract snapshot can reproduce it later.
   */
  async renderForTenant(
    tenantId: string,
    code: string,
    input: RenderTemplateInput,
  ): Promise<RenderedTemplateVersion> {
    const template = await this.repository.findByCode(tenantId, code);
    if (!template || template.versions.length === 0) {
      const builtIn = DEFAULT_TEMPLATE_CONTENT[input.locale] ?? DEFAULT_TEMPLATE_CONTENT.ar;
      return {
        locale: input.locale,
        fallback: false,
        version: null,
        title: builtIn.title,
        body: this.renderBodyStrict(builtIn.body, input.values, input.locale),
        templateVersionId: null,
      };
    }
    const selected = selectTemplateVersion(template.versions, input.locale, input.asOf);
    if (!selected) {
      throw new ConflictException({
        code: TemplatesErrorCode.TEMPLATE_VERSION_MISSING,
        message: 'No template version is effective for the requested locale and date.',
      });
    }
    return {
      locale: selected.locale as TemplateLocale,
      fallback: selected.fallback,
      version: selected.version.version,
      title: selected.version.title,
      body: this.renderBodyStrict(selected.version.body, input.values, selected.locale),
      templateVersionId: selected.version.id,
    };
  }

  // ---- parsing/validation ----

  private parseCode(value: unknown): string {
    if (typeof value !== 'string') {
      throw this.invalidInput('code must be a string.');
    }
    const code = value.trim().toUpperCase();
    if (!TEMPLATE_CODE_PATTERN.test(code)) {
      throw this.invalidInput('code must match /^[A-Z][A-Z0-9_-]{1,39}$/ after normalization.');
    }
    return code;
  }

  private parseLocale(value: unknown): TemplateLocale {
    if (!isTemplateLocale(value)) {
      throw new ConflictException({
        code: TemplatesErrorCode.INVALID_TEMPLATE_LOCALE,
        message: 'locale must be one of ar, fr, en.',
      });
    }
    return value;
  }

  private parseEffectiveFrom(value: unknown): Date {
    if (value === undefined || value === null) {
      return new Date();
    }
    const parsed = typeof value === 'string' ? new Date(value) : value instanceof Date ? value : new Date(NaN);
    if (Number.isNaN(parsed.getTime())) {
      throw this.invalidInput('effectiveFrom must be a valid date.');
    }
    return parsed;
  }

  private parseVersions(value: unknown): NormalizedVersion[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 3) {
      throw this.invalidInput('versions must be an array of 1-3 locale entries.');
    }
    const seen = new Set<TemplateLocale>();
    const versions: NormalizedVersion[] = [];
    for (const entry of value) {
      const row = entry as { locale?: unknown; title?: unknown; body?: unknown };
      const locale = this.parseLocale(row?.locale);
      if (seen.has(locale)) {
        throw this.invalidInput(`duplicate locale '${locale}' in one release.`);
      }
      seen.add(locale);
      const title = typeof row?.title === 'string' ? row.title.trim() : '';
      const body = typeof row?.body === 'string' ? row.body : '';
      if (title.length === 0 || title.length > TEMPLATE_TITLE_MAX_LENGTH) {
        throw this.invalidInput(`title must be 1-${TEMPLATE_TITLE_MAX_LENGTH} characters.`);
      }
      if (body.length === 0 || body.length > TEMPLATE_BODY_MAX_LENGTH) {
        throw this.invalidInput(`body must be 1-${TEMPLATE_BODY_MAX_LENGTH} characters.`);
      }
      const unknown = unknownTemplateVariables(body);
      if (unknown.length > 0) {
        throw new ConflictException({
          code: TemplatesErrorCode.INVALID_TEMPLATE_VARIABLES,
          message: 'Template references unknown variables.',
          details: { unknown },
        });
      }
      versions.push({ locale, title, body });
    }
    return versions;
  }

  private parseValues(value: unknown): TemplateValues {
    if (value === undefined || value === null) {
      return {};
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw this.invalidInput('variables must be an object.');
    }
    return value as TemplateValues;
  }

  private parseOptionalUuid(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw this.invalidInput('templateId must be a non-empty string.');
    }
    return value.trim();
  }

  /** Preview rendering: omitted values are filled with documented samples. */
  private renderBody(body: string, values: TemplateValues, locale: string): string {
    const merged: TemplateValues = { ...sampleTemplateValues(), ...values };
    return substituteTemplate(body, merged, locale).rendered;
  }

  /** Strict rendering (08-C): every referenced value must be supplied. */
  private renderBodyStrict(body: string, values: TemplateValues, locale: string): string {
    const { rendered, missing } = substituteTemplate(body, values, locale);
    if (missing.length > 0) {
      throw new ConflictException({
        code: TemplatesErrorCode.INVALID_TEMPLATE_INPUT,
        message: 'Template values are missing for referenced variables.',
        details: { missing },
      });
    }
    return rendered;
  }

  private invalidInput(message: string): ConflictException {
    return new ConflictException({
      code: TemplatesErrorCode.INVALID_TEMPLATE_INPUT,
      message,
    });
  }

  private async requireTemplate(tenantId: string, templateId: string) {
    const template = await this.repository.findInTenant(tenantId, templateId);
    if (!template) {
      throw new NotFoundException({
        code: TemplatesErrorCode.TEMPLATE_NOT_FOUND,
        message: 'Template not found in this agency.',
      });
    }
    return template;
  }

  // ---- responses ----

  private toSummary(
    template: { id: string; code: string; kind: string; versions: DocumentTemplateVersion[] },
    asOf: Date,
  ) {
    const current = (['ar', 'fr', 'en'] as const)
      .map((locale) => {
        const selected = selectTemplateVersion(template.versions, locale, asOf);
        return selected
          ? {
              locale: selected.locale as TemplateLocale,
              fallback: selected.fallback,
              version: selected.version.version,
              title: selected.version.title,
              effectiveFrom: selected.version.effectiveFrom.toISOString(),
            }
          : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return {
      templateId: template.id,
      code: template.code,
      kind: template.kind,
      versionCount: template.versions.length,
      current,
    };
  }

  private toResponse(template: {
    id: string;
    code: string;
    kind: string;
    createdAt: Date;
    updatedAt: Date;
    versions: DocumentTemplateVersion[];
  }): TemplateResponse {
    return {
      templateId: template.id,
      code: template.code,
      kind: template.kind,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      versions: [...template.versions]
        .sort((a, b) => a.version - b.version || a.locale.localeCompare(b.locale))
        .map((version) => ({
          version: version.version,
          locale: version.locale as TemplateLocale,
          title: version.title,
          body: version.body,
          effectiveFrom: version.effectiveFrom.toISOString(),
          createdAt: version.createdAt.toISOString(),
        })),
    };
  }
}
