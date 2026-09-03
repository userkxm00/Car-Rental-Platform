import type { TemplateLocale, TemplateValues } from './template-rules';

/**
 * PHASE-08 / 08-B contracts: template CRUD, version releases, preview
 * and the stable error codes.
 */

export const TemplatesErrorCode = {
  INVALID_TEMPLATE_INPUT: 'INVALID_TEMPLATE_INPUT',
  INVALID_TEMPLATE_LOCALE: 'INVALID_TEMPLATE_LOCALE',
  INVALID_TEMPLATE_VARIABLES: 'INVALID_TEMPLATE_VARIABLES',
  TEMPLATE_CODE_EXISTS: 'TEMPLATE_CODE_EXISTS',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  TEMPLATE_VERSION_MISSING: 'TEMPLATE_VERSION_MISSING',
} as const;

export type TemplatesErrorCodeValue = (typeof TemplatesErrorCode)[keyof typeof TemplatesErrorCode];

export interface TemplateVersionInput {
  locale?: unknown;
  title?: unknown;
  body?: unknown;
}

export interface TemplateCreateInput {
  code?: unknown;
  effectiveFrom?: unknown;
  versions?: unknown;
}

export interface TemplateAddVersionInput {
  effectiveFrom?: unknown;
  versions?: unknown;
}

export interface TemplatePreviewInput {
  templateId?: unknown;
  locale?: unknown;
  asOf?: unknown;
  variables?: unknown;
}

export interface TemplateVersionResponse {
  version: number;
  locale: TemplateLocale;
  title: string;
  body: string;
  effectiveFrom: string;
  createdAt: string;
}

export interface TemplateCurrentLocale {
  locale: TemplateLocale;
  /** True when this entry resolved through the ar → fr → en fallback. */
  fallback: boolean;
  version: number;
  title: string;
  effectiveFrom: string;
}

export interface TemplateSummary {
  templateId: string;
  code: string;
  kind: string;
  versionCount: number;
  current: TemplateCurrentLocale[];
}

export interface TemplateListResponse {
  templates: TemplateSummary[];
  /** Built-in locales available while no agency template exists. */
  builtInLocales: TemplateLocale[];
  /** False until the agency releases its own template (08-B01). */
  configured: boolean;
}

export interface TemplateResponse {
  templateId: string;
  code: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  versions: TemplateVersionResponse[];
}

export interface TemplatePreviewResponse {
  locale: TemplateLocale;
  /** True when the requested locale fell back (ar → fr → en). */
  fallback: boolean;
  /** null for the built-in defaults (no tenant version yet). */
  version: number | null;
  title: string;
  /** Fully substituted body for the effective template version. */
  body: string;
}

export interface RenderedTemplateVersion {
  locale: TemplateLocale;
  fallback: boolean;
  version: number | null;
  title: string;
  body: string;
  templateVersionId: string | null;
}

/** Internal render input shared with the contract workflow (08-C). */
export interface RenderTemplateInput {
  locale: TemplateLocale;
  asOf: Date;
  values: TemplateValues;
}
