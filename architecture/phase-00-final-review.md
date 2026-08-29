# Phase 00 — Final Architecture Review

## Purpose

This document is the final pre-implementation review for the architecture foundation. It does not authorize application coding by itself; all blocking decisions must be satisfied before declaring Architecture Freeze.

## Product scope confirmed

Release 1:
- Customer Web
- Agency Owner/Admin Web
- Agency Operations Mobile App
- Platform Owner Control Center Web

Release 2+:
- Customer Mobile App using the same backend/domain platform

## Architecture confirmed

- Modular monolith first.
- TypeScript as primary application language.
- NestJS API/backend.
- PostgreSQL as durable system of record.
- PostGIS for spatial data and spatial queries.
- Prisma as primary data-access layer, with explicit SQL/adapter boundaries for specialized PostGIS operations.
- REST API under `/api/v1` with OpenAPI.
- Shared contracts/types/validation where safe.
- Object storage for large files/photos/PDFs.
- Redis only where justified for cache, rate limiting, or asynchronous work.
- Provider adapters for maps, payments, storage, notifications, and identity.

## Critical domain guarantees

### Tenant isolation

Every tenant-owned resource must have an explicit tenant ownership path. Authorization and data-access checks must prevent cross-tenant reads/writes, exports, background-job access, and object-storage access.

### Booking integrity

Booking creation/confirmation/extension/reassignment must use authoritative availability validation and concurrency-safe writes. Double booking must be prevented under concurrent requests.

### Availability

Availability is computed from reservations, active rentals, maintenance, inspection/readiness holds, damage/accident holds, manual blocks, and transfer/repositioning intervals. A boolean vehicle status is not authoritative.

### Pricing

All authoritative prices are calculated server-side. Confirmed bookings retain historical commercial snapshots. Floating-point arithmetic must not be used for authoritative money values.

### Financial integrity

Payments, deposits, refunds, adjustments and invoices are auditable records. Historical financial truth must not depend on mutable current configuration.

### Inspection/damage

Pickup and return inspections are first-class records with evidence, meter/fuel data, actor and timestamps. AI can assist but cannot directly assign liability or charges.

## Localization requirement

Release 1 customer-facing and agency-facing product surfaces must support:
- Arabic
- French
- English

Arabic must be first-class RTL, not a string-translation afterthought.

Initial primary currency:
- DZD

Additional currencies must be architecturally possible without changing the domain model.

## Map requirement

Maps are a core capability.

The model must support:
- country/region/wilaya/city/area hierarchy where applicable
- branches
- parking/staging points
- pickup/drop-off points
- airport pickup/return
- hotel pickup/delivery where enabled
- custom meeting points subject to agency policy
- delivery/service-zone polygons
- distance calculation
- geocoding
- address autocomplete
- directions/routing through provider adapters

Exact vehicle live location must not be exposed publicly by default.

## Authentication decision gate

Do not code against a provider-specific identity model before the Auth ADR is accepted.

The selected solution must support or cleanly integrate with:
- email/password where used
- phone/OTP where used
- secure sessions/tokens
- password reset
- email/phone verification
- MFA for privileged accounts where required
- device/session management
- account recovery
- role + tenant + permission authorization

The application must remain able to change the identity provider without rewriting domain authorization concepts.

## Infrastructure decision gate

Before production launch, select the managed PostgreSQL provider using explicit criteria:
- cost
- region/latency
- backups
- point-in-time recovery where required
- restore process
- connection pooling
- monitoring
- security/networking
- migration portability

Development may use local PostgreSQL. Production should normally use managed PostgreSQL unless a documented operational reason supports self-hosting.

## External integration decision gate

Map, payment, notification, identity, and object-storage providers must be selected through capability requirements, not brand preference alone.

Provider-specific SDKs stay behind adapters.

## Quality gate

Architecture Freeze requires:
- business rules documented
- domain model reviewed
- booking state machine reviewed
- availability model reviewed
- pricing model reviewed
- permission matrix reviewed
- API contract rules reviewed
- database physical specification reviewed
- security threat model reviewed
- infrastructure/recovery plan reviewed
- testing strategy reviewed
- mobile/web surface strategy reviewed
- ADRs for accepted architectural decisions
- no known critical contradictions across documents

## Freeze status

**NOT FROZEN UNTIL ALL DECISION GATES ARE EXPLICITLY ACCEPTED.**

## Next implementation stage

After freeze:

**Phase 01 — Identity & Access**

Implementation must begin with the repository/monorepo foundation, CI quality gates, environment configuration, database connection/migration baseline, and identity/access foundations according to the approved architecture. No domain feature should bypass these foundations.
