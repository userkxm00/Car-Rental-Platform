-- 07-B09: marketplace search index strategy.
--
-- The search hot paths are: participating agencies (partial index on the
-- opt-in flag), candidate vehicles per agency/status (availability + fleet
-- status) and per-agency category filtering, and ACTIVE pickup branches
-- per agency. City text matching stays an ILIKE scan until the spatial
-- phase (07-C09) brings PostGIS-backed location search.

-- Participating agencies: ACTIVE + marketplaceEnabled.
CREATE INDEX "tenants_marketplace_participating_idx"
  ON "tenants" ("id")
  WHERE "status" = 'ACTIVE' AND "marketplaceEnabled" = true;

CREATE INDEX "vehicles_tenantId_status_idx" ON "vehicles"("tenantId", "status");
CREATE INDEX "vehicles_tenantId_categoryId_idx" ON "vehicles"("tenantId", "categoryId");
CREATE INDEX "branches_tenantId_status_idx" ON "branches"("tenantId", "status");
