import { ApiClient } from '../client';

/**
 * Typed contract-template endpoints (PHASE-08 08-B). Mirrors
 * apps/api/src/templates/presentation/templates.controller.ts.
 * Agency references are server-derived from the caller's membership.
 */

export type TemplateLocale = 'ar' | 'fr' | 'en';

export interface TemplateVersionDto {
  version: number;
  locale: TemplateLocale;
  title: string;
  body: string;
  effectiveFrom: string;
  createdAt: string;
}

export interface TemplateCurrentLocaleDto {
  locale: TemplateLocale;
  fallback: boolean;
  version: number;
  title: string;
  effectiveFrom: string;
}

export interface TemplateSummaryDto {
  templateId: string;
  code: string;
  kind: string;
  versionCount: number;
  current: TemplateCurrentLocaleDto[];
}

export interface TemplateListResponseDto {
  templates: TemplateSummaryDto[];
  builtInLocales: TemplateLocale[];
  configured: boolean;
}

export interface TemplateResponseDto {
  templateId: string;
  code: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  versions: TemplateVersionDto[];
}

export interface TemplatePreviewResponseDto {
  locale: TemplateLocale;
  fallback: boolean;
  version: number | null;
  title: string;
  body: string;
}

export interface TemplateVersionInput {
  locale: TemplateLocale;
  title: string;
  body: string;
}

export interface TemplatesApi {
  list(agencyId: string): Promise<TemplateListResponseDto>;
  create(
    agencyId: string,
    input: { code: string; effectiveFrom?: string; versions: TemplateVersionInput[] },
  ): Promise<TemplateResponseDto>;
  get(agencyId: string, templateId: string): Promise<TemplateResponseDto>;
  addVersion(
    agencyId: string,
    templateId: string,
    input: { effectiveFrom?: string; versions: TemplateVersionInput[] },
  ): Promise<TemplateResponseDto>;
  preview(
    agencyId: string,
    input: {
      templateId?: string;
      locale: TemplateLocale;
      asOf?: string;
      variables?: Record<string, string | number>;
    },
  ): Promise<TemplatePreviewResponseDto>;
}

export function createTemplatesApi(client: ApiClient): TemplatesApi {
  const base = (agencyId: string) => `/agencies/${agencyId}/document-templates`;
  return {
    list: (agencyId) => client.get(base(agencyId)),
    create: (agencyId, input) => client.post(base(agencyId), input),
    get: (agencyId, templateId) => client.get(`${base(agencyId)}/${templateId}`),
    addVersion: (agencyId, templateId, input) => client.post(`${base(agencyId)}/${templateId}/versions`, input),
    preview: (agencyId, input) => client.post(`${base(agencyId)}/preview`, input),
  };
}
