-- PHASE-08 / 08-B01/08-B02: versioned contract templates. The template
-- row is the logical identity and versions are append-only releases per
-- locale (ar/fr/en) so historical signed contracts stay reproducible
-- (docs/06 documents, architecture/database-domain-model.md).

CREATE TYPE "DocumentTemplateKind" AS ENUM ('RENTAL_CONTRACT');

CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "DocumentTemplateKind" NOT NULL DEFAULT 'RENTAL_CONTRACT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_template_versions" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_templates_tenantId_code_key" ON "document_templates"("tenantId", "code");

CREATE UNIQUE INDEX "document_template_versions_templateId_locale_version_key"
    ON "document_template_versions"("templateId", "locale", "version");

CREATE INDEX "document_template_versions_templateId_idx" ON "document_template_versions"("templateId");

ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
