# Architecture Freeze — Release 1 Baseline

## Status

**FROZEN — Release 1 Core Architecture**

This file is the single authoritative freeze-status document. Product/business details live under `docs/`; architecture decisions live under `architecture/`; execution state lives under `agent/`.

## What is frozen

- Product model: Agency SaaS + Customer Marketplace + Platform Control Plane.
- Release 1 client surfaces: Customer Web, Agency Web, Agency Operations Mobile, Platform Owner Web.
- Customer Mobile App is Release 2+.
- TypeScript + NestJS modular monolith.
- PostgreSQL + PostGIS + Prisma with isolated SQL paths where PostGIS-specific behavior requires them.
- Versioned REST API `/api/v1` + OpenAPI.
- Provider-neutral auth, storage, maps/geocoding, messaging and payment adapters.
- Explicit multi-tenant isolation and RBAC/permission/resource scope.
- Server-authoritative availability, booking, pricing and financial truth.
- Hybrid monetization architecture: Free + Trial + Subscription + License Key + Manual Renewal + optional Marketplace Commission + optional Google Ads, with independent activation.
- Arabic/French/English + RTL + DZD baseline.
- First-class map/list marketplace discovery.
- Pickup/return inspection, damage evidence and maintenance/readiness workflows.
- Security, auditability, idempotency, testing and observability requirements.

## Provider decisions

Provider selection is an implementation-level decision behind approved abstractions, not a reason to change the frozen domain architecture. The executing phase must select and record concrete providers before the first task that requires them.

Required examples:
- Identity provider for Phase 01.
- Managed PostgreSQL hosting for deployment work.
- Object storage provider before production media/document work.
- Initial map/geocoding provider before production map integration.
- Payment provider only when its task is reached; Release 1 must work without online customer checkout.

A provider choice must be recorded in an ADR or implementation decision note when it creates material operational or security consequences.

## Freeze does NOT mean

- Every future feature is implemented now.
- Every provider is permanently fixed forever.
- A UI cannot evolve.
- A new feature cannot be added.

It means the core architecture cannot be silently replaced or contradicted.

## Change policy

A material change to database technology, tenancy, identity architecture, authorization model, booking/availability invariants, API contract strategy, monetary source of truth, storage/security model, deployment topology, or client responsibilities requires:

1. written problem statement;
2. impact analysis;
3. ADR/update;
4. documentation synchronization;
5. only then implementation.

Normal feature work that stays inside the frozen architecture does not require a new ADR.

## Freeze gate result

All previously listed pre-freeze concerns have been converted into either:
- frozen architecture rules;
- phase/task implementation decisions behind an abstraction;
- Release 1 acceptance criteria;
- or documented future scope.

Therefore the repository is authorized to begin **Phase 01 — Identity & Access**.

## Next phase

`PHASE-01` / `TASK-01-01`
