# PHASE-03 — Fleet Foundation

## 03-01 Categories and vehicles
**Depends:** 02-05. **Skills:** car-rental-domain, postgres-production, nestjs-production.
**Acceptance:** category/vehicle identity, tenant ownership, lifecycle fields and uniqueness are implemented with migrations/tests.

## 03-02 Vehicle lifecycle/readiness
**Depends:** 03-01. **Skills:** car-rental-domain, postgres-production.
**Acceptance:** operational states and readiness blockers are explicit; no availability truth is stored as a trusted boolean.

## 03-03 Vehicle documents/expiry
**Depends:** 03-01. **Skills:** car-rental-domain, financial-auditability, postgres-production.
**Acceptance:** document metadata, expiry, status and secure ownership are implemented; expiry queries and authorization are tested.

## 03-04 Vehicle media/gallery
**Depends:** 03-01. **Skills:** frontend-design, visual-qa, integration-connector-architecture, agent-skill-security.
**Acceptance:** structured gallery metadata and private storage references work; upload validation and access checks pass.

## 03-05 Phase gate
**Depends:** 03-02, 03-03, 03-04. **Gate:** vehicle lifecycle, documents, media, tenant scope and tests pass; evidence recorded.
