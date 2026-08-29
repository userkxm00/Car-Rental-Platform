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

## Authentication decision

**Release 1 Identity Provider: Supabase Auth.**

Supabase Auth is an authentication service only. The application domain remains authoritative in NestJS + PostgreSQL.

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

## Provider abstraction rule

Other external providers remain replaceable adapters:

- object storage
- maps/geocoding/routing
- customer/agency messaging
- payment gateways

Their concrete provider is selected when its implementation phase begins and recorded when the choice has material operational/security consequences.

Provider selection does not reopen the frozen domain architecture.

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

The previously open architecture-readiness items have been classified as:

- fixed core architecture rules;
- implementation-level provider decisions behind abstractions;
- Release 1 acceptance criteria;
- future/deferred scope.

Authentication is now explicitly decided as Supabase Auth for Release 1.

The repository is therefore authorized to execute:

`PHASE-01` / `TASK-01-01`
