# Architecture Freeze Checklist

## Purpose

Phase 00 cannot be considered implementation-ready until every critical architectural decision has an explicit owner, rationale, and verification path.

## Product scope

- [x] Release 1 surfaces documented.
- [x] Customer Web defined.
- [x] Agency Operations Mobile defined.
- [x] Agency Owner/Admin Web defined.
- [x] Platform Owner Web defined.
- [x] Customer Mobile deferred to a later release without requiring backend redesign.

## Platform architecture

- [x] API-first architecture.
- [x] Modular monolith is the initial backend shape.
- [x] Domain boundaries listed.
- [x] Integration adapters defined conceptually.
- [ ] Final hosting topology selected.
- [ ] Staging environment design completed.
- [ ] Production networking and deployment design completed.

## Technology decisions

- [x] TypeScript — application language.
- [x] NestJS — backend framework direction.
- [x] PostgreSQL — durable database.
- [x] PostGIS — geospatial extension.
- [x] Prisma — primary application data access layer, with deliberate SQL adapter for specialized PostGIS operations.
- [x] React/TypeScript web direction.
- [x] React Native/Expo mobile direction.
- [ ] Exact web framework finalized after SEO/SSR requirements review.
- [ ] Authentication provider selected.
- [ ] Object storage provider selected.
- [ ] Queue provider/infrastructure selected if required.
- [ ] Monitoring/error platform selected.

## Database

- [x] Logical ERD documented.
- [x] Core entity inventory documented.
- [x] Tenant ownership strategy documented.
- [x] Historical snapshots documented.
- [x] Financial append/audit model documented.
- [x] PostGIS location model documented.
- [ ] Physical PostgreSQL column/type specification completed.
- [ ] Index catalog completed.
- [ ] Constraint catalog completed.
- [ ] PostgreSQL range/exclusion strategy for booking conflicts finalized.
- [ ] Migration conventions completed.
- [ ] Backup/restore requirements mapped to selected provider.

## Authentication and authorization

- [x] Actor model defined.
- [x] Role model defined.
- [x] Permission naming strategy defined.
- [x] Tenant isolation rules defined.
- [x] Platform vs agency security domain separated.
- [x] Customer access boundaries defined.
- [ ] Authentication provider decision recorded in ADR.
- [ ] Session/token implementation decision recorded in ADR.
- [ ] MFA policy finalized.
- [ ] Complete permission matrix reviewed against every protected endpoint.

## Core business domains

- [x] Booking lifecycle concept.
- [x] Availability concept.
- [x] Pricing concept.
- [x] Fleet concept.
- [x] Maps/location concept.
- [x] Inspection/damage concept.
- [x] Maintenance/readiness concept.
- [x] Payments/billing concept.
- [x] Licensing/entitlements concept.
- [ ] Detailed API contracts reviewed.
- [ ] Detailed event catalog reviewed.
- [ ] Detailed error catalog reviewed.

## Security

- [x] Tenant isolation is a non-negotiable rule.
- [x] Client-side values are not trusted.
- [x] File access rules defined.
- [x] Audit requirements defined.
- [ ] Threat model completed.
- [ ] Security headers/CORS/CSRF strategy completed.
- [ ] Secrets/configuration strategy completed.
- [ ] Dependency/supply-chain policy completed.
- [ ] Abuse/rate-limit policy completed.

## Quality

- [x] Unit/integration/E2E principles established.
- [ ] Test matrix mapped to critical business rules.
- [ ] CI quality gates implemented.
- [ ] Migration tests/rehearsal procedure documented.
- [ ] Observability acceptance criteria documented.

## Localization and regional readiness

- [x] Arabic support.
- [x] French support.
- [x] English support.
- [x] RTL requirement.
- [x] DZD baseline.
- [x] Multi-currency architecture direction.
- [ ] Regional address/location reference data strategy finalized.
- [ ] Contract/document localization rules finalized.
- [ ] Local payment integration strategy finalized per target market.

## Release readiness

Phase 00 is **not frozen** until all unchecked items classified as blocking are resolved or explicitly deferred in an ADR with justification.

When frozen, add:

```text
Architecture Status: FROZEN
Version: X.Y
Date: YYYY-MM-DD
```

Any later architectural change must create or update an ADR and explain migration impact.
