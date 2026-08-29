# Architecture Freeze — Release 1 Baseline

## Status

**FROZEN — Release 1 Core Architecture**

This is the single authoritative freeze-status document.

## Frozen product and technical baseline

- Product model: Agency SaaS + Customer Marketplace + Platform Control Plane.
- Release 1 client surfaces: Customer Web, Agency Web, Agency Operations Mobile, Platform Owner Web.
- Customer Mobile App is Release 2+.
- TypeScript + NestJS modular monolith.
- PostgreSQL + PostGIS + Prisma, with isolated SQL paths where PostgreSQL/PostGIS-specific behavior requires them.
- Versioned REST API `/api/v1` + OpenAPI.
- Explicit multi-tenant isolation and server-side RBAC/permission/resource scope.
- Server-authoritative availability, booking, pricing and financial truth.
- Hybrid monetization: Free + Trial + Subscription + License Key + Manual Renewal + optional Marketplace Commission + optional Google Ads, independently configurable.
- Arabic/French/English + RTL + DZD baseline.
- First-class map/list marketplace discovery.
- Pickup/return inspection, damage evidence and maintenance/readiness workflows.
- Security, auditability, idempotency, testing and observability requirements.
- PostgreSQL/PostGIS search is the Release 1 search foundation; no external search engine is required.
- Redis is non-authoritative infrastructure for jobs, cache, rate limits and ephemeral coordination where needed.
- Container-first deployment keeps hosting portable.

## Authentication decision

**Release 1 Identity Provider: Supabase Auth.**

Supabase Auth handles authentication capabilities such as password login, verification, recovery and supported MFA. The application domain remains authoritative in NestJS + PostgreSQL.

```text
Supabase Auth
    ↓
Application Identity Boundary
    ↓
User
    ↓
Membership / Role / Permission
    ↓
Tenant / Branch / Resource scope
    ↓
Business Rules / Entitlements
```

Provider-specific SDK calls and identifiers must remain inside the auth/infrastructure boundary. Domain services must not depend on Supabase SDK types or use provider metadata as authorization truth.

## Final Release 1 provider decisions

### Maps

**MapLibre** is the map rendering layer.

**MapTiler Cloud** is the initial managed map/geocoding provider behind an internal adapter. Commercial production use must use a plan whose terms permit commercial use. PostGIS remains authoritative for stored coordinates and spatial queries.

### Object storage

**Cloudflare R2** is the initial production S3-compatible object storage provider behind a storage adapter. Sensitive documents/media remain private and are accessed through controlled application authorization/signed access where appropriate.

### Observability

**Sentry** is the initial application error-monitoring provider, supplemented by structured logs, correlation IDs and metrics/tracing interfaces.

### Background work

**Redis** is used for non-authoritative queues/jobs, rate limiting, cache and ephemeral coordination where required. Business truth never depends on Redis availability.

### Hosting

The application is container-first and deployable to a managed hosting environment. A concrete hosting vendor is selected during deployment validation based on cost, operational fit, PostgreSQL/PostGIS support, backups, networking and availability. This choice must not change the application architecture.

## Finalized critical domain decisions

### Booking inventory model

Support both:
- vehicle-specific reservations;
- category-based reservations with later vehicle assignment.

### Booking lifecycle

Canonical lifecycle:

`DRAFT → HOLD → PENDING_CONFIRMATION → CONFIRMED → READY_FOR_PICKUP → ACTIVE → RETURN_PENDING → RETURNED → SETTLEMENT_PENDING → COMPLETED`

Exceptional terminal states:

`REJECTED`, `EXPIRED`, `CANCELLED`, `NO_SHOW`.

Transitions are explicit domain commands and cannot be selected arbitrarily by clients.

### Cancellation/no-show

Agency-specific policies are configurable and effective-dated. The system records the policy version and resulting financial outcome. Baseline customer cancellation rules use time-to-pickup windows; agency cancellation after confirmation defaults to refundable reversal of customer-paid amounts subject to documented policy; active-rental early termination is a separate operation; no-show uses a configurable grace window and its own financial outcome.

### Availability/concurrency

Use application validation plus PostgreSQL transaction/conflict protection. Vehicle-specific overlapping active/held intervals must be prevented at the database/concurrency layer where supported by the physical model. Category bookings use capacity-aware availability calculations.

### Pricing and money

Use deterministic server-side calculations and exact financial representations. DZD is the primary Release 1 currency. Historical quote/booking price snapshots are immutable. Refunds/corrections are separate auditable financial events.

### Search

Release 1 uses PostgreSQL/PostGIS with appropriate relational indexes and full-text/trigram capabilities where beneficial. Elasticsearch/OpenSearch is not a Release 1 dependency.

### Background jobs and realtime

Background work uses Redis-backed jobs when asynchronous execution is needed. Release 1 does not require WebSockets as a foundational transport; REST plus appropriate invalidation/polling/notifications is sufficient unless a concrete feature proves otherwise.

### Recovery targets

Initial production objectives:
- RPO: 1 hour or better for authoritative business data.
- RTO: 4 hours or better for a major service restoration.

Backup and restore procedures must be tested before production release.

## Provider abstraction rule

External providers remain replaceable adapters. Provider-specific objects must not leak into domain logic.

Changing a provider must not require rewriting booking, pricing, availability, tenant, or financial domain rules.

## Freeze does NOT mean

- every future feature is implemented now;
- every vendor is permanent forever;
- UI cannot evolve;
- normal feature work requires an ADR.

The freeze prevents silent changes to the core architecture and authoritative business invariants.

## Change policy

A material change to database technology, tenancy, authentication architecture, authorization model, booking/availability invariants, API strategy, monetary source of truth, storage/security model, deployment topology, or client responsibilities requires:

1. problem statement;
2. impact analysis;
3. ADR/update;
4. documentation synchronization;
5. implementation only after that review.

## Freeze gate result

All previously open architecture-readiness items have been converted into accepted architecture rules, provider decisions behind abstractions, domain-policy ADRs, Release 1 acceptance criteria, or documented future scope.

The repository is authorized to execute:

`PHASE-01` / `TASK-01-01`
