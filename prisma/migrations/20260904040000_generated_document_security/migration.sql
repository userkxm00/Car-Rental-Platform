-- PHASE-08 / 08-D: secure document lifecycle. (08-D04) `retainUntil`
-- records the retention horizon when a generated PDF is created;
-- (08-D05) `revokedAt`/`revokedById` stop further signed-URL issuance
-- after an explicit staff revocation, preserving the historical row;
-- (08-D03) `document_access_events` is the append-only audit trail of
-- every signed-URL issuance, revocation and restore (docs/06).

CREATE TYPE "DocumentAccessAction" AS ENUM ('URL_ISSUED', 'ACCESS_REVOKED', 'ACCESS_RESTORED');
CREATE TYPE "DocumentAccessChannel" AS ENUM ('STAFF', 'CUSTOMER');

ALTER TABLE "generated_documents" ADD COLUMN "retainUntil" TIMESTAMP(3);
ALTER TABLE "generated_documents" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "generated_documents" ADD COLUMN "revokedById" UUID;

CREATE TABLE "document_access_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "action" "DocumentAccessAction" NOT NULL,
    "channel" "DocumentAccessChannel" NOT NULL,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_access_events_documentId_createdAt_idx" ON "document_access_events"("documentId", "createdAt");
CREATE INDEX "document_access_events_tenantId_createdAt_idx" ON "document_access_events"("tenantId", "createdAt");

ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_access_events" ADD CONSTRAINT "document_access_events_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "generated_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_access_events" ADD CONSTRAINT "document_access_events_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
