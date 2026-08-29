# System Architecture

## Status
Proposed for Phase 00. Implementation must not begin until the architecture review gate is accepted.

## Objective
Build a production-grade multi-tenant car-rental SaaS platform using a modular monolith backend and purpose-built clients. Prefer well-understood boundaries over premature microservices.

## High-level topology

```text
Customer Web ───────┐
Agency Operations ──┼──> NestJS API / Domain Layer
Owner/Admin Web ────┘             │
                                  ├── PostgreSQL + PostGIS
                                  ├── Object Storage
                                  ├── Redis/Queue (when justified)
                                  └── External provider adapters

Platform Owner Web ─────────────> Platform Admin modules

Future Customer App ────────────> Same API/domain layer
```

## Architectural style

Use a **modular monolith** initially.

The backend has strong domain/module boundaries but is deployed as one service unless operational evidence later justifies extraction.

Why:
- simpler deployment and local development
- fewer network boundaries
- simpler transactions for booking/payment workflows
- easier testing
- easier Replit Agent implementation
- modules can later be extracted behind explicit contracts

## Backend modules

- Identity & Access
- Tenancy & Organizations
- Branches & Locations
- Fleet
- Availability
- Booking
- Pricing
- Customer CRM
- Contracts & Documents
- Inspection & Damage
- Maintenance & Readiness
- Payments & Billing
- Notifications
- Operations Tasks
- Partners / Referrals / Loyalty
- Analytics
- AI Assistance
- Subscriptions / Licensing / Entitlements
- Audit / Compliance
- Platform Administration

## Module layering

```text
HTTP / Transport
      ↓
Application use case
      ↓
Domain rules / domain service
      ↓
Repository / adapter interface
      ↓
Prisma / SQL / external provider
```

Controllers must not own complex business logic.

## Data authority

PostgreSQL is the durable source of truth.

The backend is authoritative for:
- authorization
- tenant ownership
- availability
- pricing
- booking lifecycle
- payments
- documents
- inspections
- maintenance state
- subscriptions and entitlements

Clients are never authoritative for these values.

## API

Version public APIs from the beginning:

`/api/v1/...`

Use consistent conventions for:
- resource naming
- pagination
- filtering/sorting
- validation errors
- authorization errors
- idempotency
- request IDs
- correlation IDs

Maintain OpenAPI documentation from the API contract.

## Transactions and concurrency

Use database transactions for state changes that must be atomic, especially booking creation/extension, payment reconciliation and critical inventory transitions.

Do not hold long transactions across slow external network calls unless explicitly justified.

Booking conflict prevention must account for concurrent requests, duplicate submissions and retries.

## Events and background work

Use events/queues for non-critical side effects:
- notifications
- emails
- reminders
- report generation
- document processing
- AI analysis
- analytics updates

Transactional business state must be persisted first. Use an outbox/reliable-event pattern where necessary to avoid lost side effects.

## Redis

Optional infrastructure for:
- short-lived cache
- rate limiting
- queue support
- ephemeral coordination

Never use Redis as durable truth for bookings, payments, contracts or financial history.

## Object storage

Store large files outside PostgreSQL:
- vehicle photos
- inspection/damage evidence
- identity documents
- contracts
- receipts

PostgreSQL stores ownership, metadata, checksum and object key. Private objects use authorization-aware/signed access.

## Multi-tenancy

Every tenant-owned resource must have an explicit ownership path. Backend authorization and data-access scoping are mandatory. Database-level defenses such as PostgreSQL RLS may be added where they provide meaningful defense-in-depth.

## Maps

Map infrastructure is adapter-based and separates:
- geocoding
- address autocomplete
- map rendering
- routing/directions
- distance calculation

PostGIS is the persistent geospatial layer. Provider-specific place IDs must not become the domain's only location identity.

## Prisma + PostGIS boundary

Prisma is the primary relational data-access layer. PostGIS geographic types and specialized spatial queries are isolated behind a small SQL/adapter boundary because current Prisma ORM support does not provide full native PostGIS field support. Those raw queries must be parameterized, tested and reviewed.

## Deployment

Development:
- PostgreSQL 18.x + PostGIS
- object storage development provider/emulator
- optional Redis

Production:
- managed PostgreSQL + PostGIS
- managed object storage
- Redis only when justified
- HTTPS
- automated migrations
- backups and restore tests

The managed infrastructure provider is an ADR, not a domain dependency.

## Architectural invariants

1. No client owns business truth.
2. No protected operation bypasses authorization.
3. No booking operation bypasses availability rules.
4. No pricing total is trusted from the client.
5. No tenant query intentionally crosses tenant scope.
6. Historical facts required for audit are immutable/append-oriented.
7. External services are behind adapters.
8. New architectural patterns require an ADR.
