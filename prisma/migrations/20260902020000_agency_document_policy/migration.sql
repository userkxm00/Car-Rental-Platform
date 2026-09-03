-- PHASE-08 / 08-A02: agency document policy (one per agency). The
-- required-types list reuses the existing customer document type enum,
-- so no new enum is introduced.
CREATE TABLE "agency_document_policies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "requiredTypes" "CustomerDocumentType"[],
    "requirePassportForForeignLicense" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_document_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agency_document_policies_tenantId_key" ON "agency_document_policies"("tenantId");

ALTER TABLE "agency_document_policies" ADD CONSTRAINT "agency_document_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
