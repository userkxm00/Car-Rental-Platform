-- PHASE-08 / 08-C: rental contract aggregate (08-C01), the immutable
-- rendered snapshot (08-C02), the signature boundary (08-C03) and the
-- receipt + generated PDF artifact records (08-C05/08-C04). Snapshots and
-- signatures keep the template version and content hash so historical
-- signed documents remain reproducible (08-C07, docs/06).

CREATE TYPE "RentalContractStatus" AS ENUM ('ISSUED', 'SIGNED', 'CANCELLED');
CREATE TYPE "ContractSignatureMethod" AS ENUM ('CUSTOMER_DIGITAL', 'ON_SITE');
CREATE TYPE "ContractSignerRole" AS ENUM ('CUSTOMER', 'AGENCY_REPRESENTATIVE');
CREATE TYPE "ReceiptKind" AS ENUM ('RENTAL_CONTRACT');
CREATE TYPE "GeneratedDocumentKind" AS ENUM ('RENTAL_CONTRACT', 'RENTAL_RECEIPT');

CREATE TABLE "rental_contracts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "status" "RentalContractStatus" NOT NULL DEFAULT 'ISSUED',
    "locale" TEXT NOT NULL,
    "issuedById" UUID,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_snapshots" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "templateId" UUID,
    "templateCode" TEXT NOT NULL,
    "templateVersion" INTEGER,
    "locale" TEXT NOT NULL,
    "variablesJson" JSONB NOT NULL,
    "contentText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contract_signatures" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "method" "ContractSignatureMethod" NOT NULL,
    "signerRole" "ContractSignerRole" NOT NULL,
    "signerName" TEXT NOT NULL,
    "note" TEXT,
    "signedByUserId" UUID,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "templateVersionId" UUID,
    "templateVersion" INTEGER,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "kind" "ReceiptKind" NOT NULL DEFAULT 'RENTAL_CONTRACT',
    "locale" TEXT NOT NULL,
    "totalsJson" JSONB NOT NULL,
    "contentText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_documents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" "GeneratedDocumentKind" NOT NULL,
    "bookingId" UUID,
    "contractId" UUID,
    "receiptId" UUID,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rental_contracts_bookingId_key" ON "rental_contracts"("bookingId");
CREATE UNIQUE INDEX "rental_contracts_tenantId_contractNumber_key" ON "rental_contracts"("tenantId", "contractNumber");

CREATE UNIQUE INDEX "contract_snapshots_contractId_key" ON "contract_snapshots"("contractId");

CREATE UNIQUE INDEX "contract_signatures_contractId_key" ON "contract_signatures"("contractId");

CREATE UNIQUE INDEX "receipts_bookingId_key" ON "receipts"("bookingId");
CREATE UNIQUE INDEX "receipts_contractId_key" ON "receipts"("contractId");
CREATE UNIQUE INDEX "receipts_tenantId_receiptNumber_key" ON "receipts"("tenantId", "receiptNumber");

CREATE INDEX "generated_documents_contractId_idx" ON "generated_documents"("contractId");
CREATE INDEX "generated_documents_receiptId_idx" ON "generated_documents"("receiptId");
CREATE INDEX "generated_documents_tenantId_createdAt_idx" ON "generated_documents"("tenantId", "createdAt");

ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_issuedById_fkey"
    FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_snapshots" ADD CONSTRAINT "contract_snapshots_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_snapshots" ADD CONSTRAINT "contract_snapshots_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_signedByUserId_fkey"
    FOREIGN KEY ("signedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "rental_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
