-- PHASE-08 / 08-C02: the snapshot stores the rendered title alongside
-- the content so a signed PDF can be regenerated faithfully (08-C07).

ALTER TABLE "contract_snapshots" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
