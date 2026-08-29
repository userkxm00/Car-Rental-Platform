# PHASE-02 — Multi-Tenancy & Organization

## 02-01 Agency/tenant model
**Depends:** 01-05. **Skills:** car-rental-domain, postgres-production, nestjs-production.
**Acceptance:** agency tenant, lifecycle, ownership and unique identifiers are persisted; tenant status changes are audited; migration/tests pass.

## 02-02 Branches and locations
**Depends:** 02-01. **Skills:** maps-postgis, car-rental-domain, postgres-production.
**Acceptance:** branch/location hierarchy, coordinates/context, hours/settings and ownership are modeled; geospatial fields and indexes are validated.

## 02-03 Server-side tenant context
**Depends:** 02-01, 02-02. **Skills:** nestjs-production, postgres-production, api-contracts.
**Acceptance:** authenticated requests resolve tenant context server-side; repositories/services cannot use unchecked client tenant IDs.

## 02-04 Isolation regression suite
**Depends:** 02-03. **Skills:** testing-quality, postgres-production, nestjs-production.
**Acceptance:** cross-tenant read/write/export/update/delete attempts fail safely; background jobs and files are scoped.

## 02-05 Phase gate
**Depends:** 02-04. **Gate:** all four tasks DONE; migration, authorization, isolation, typecheck, lint, build and tests pass; evidence recorded.
