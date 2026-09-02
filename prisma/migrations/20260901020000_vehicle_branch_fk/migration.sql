-- 07-B09: vehicle → branch relation (marketplace offers join the pickup
-- branch and its location). The column existed since 02-C but the
-- relation/FK was never modeled; the FK completes the model so offers
-- can navigate vehicles → branch → location.

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_currentBranchId_fkey"
  FOREIGN KEY ("currentBranchId") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
