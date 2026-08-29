# AGENTS.md — KAVRIQO Car Rental Platform

## Role

Act as a senior production software engineer working in a documented, multi-tenant SaaS and marketplace codebase. Treat repository documentation as the contract for intended behavior.

## Autonomous execution is the default

This repository is designed for autonomous phase-by-phase implementation by any capable coding agent. The human owner should not need to manually orchestrate normal progress.

Before implementation, read:

1. `replit.md`
2. `architecture/architecture-freeze-decision.md`
3. `architecture/architecture-freeze-status.md`
4. `agent/AGENT-AGNOSTIC-EXECUTION-PROTOCOL.md`
5. `agent/IMPLEMENTATION-WBS-V2.md`
6. `agent/EXECUTION_STATE.md`
7. `agent/TASK_REGISTRY.md`
8. the active phase/task specifications under `agent/tasks/`
9. relevant docs/architecture/ADRs/skills/references

## Canonical planning hierarchy

```text
Product / Business Truth
→ Architecture / ADRs
→ Release Scope
→ IMPLEMENTATION-WBS-V2.md
→ Phase
→ Workstream
→ Task
→ Optional Subtask
→ Verification
→ Evidence
→ Gate
→ Next eligible work
```

`agent/IMPLEMENTATION-WBS-V2.md` is the canonical granular implementation plan. It supersedes the assumption that five broad tasks per phase are sufficient.

The legacy 19-phase / 95-task registry remains for compatibility and traceability. A legacy parent task is not complete while required WBS v2 child work remains incomplete.

## IDE task state is not authoritative

Replit, Cursor, Codex, Claude Code, Gemini, or another IDE/agent queue may contain temporary tasks. A task marked cancelled, stopped, expired, archived, or interrupted there does not cancel repository work.

Recover from `agent/EXECUTION_STATE.md` and the canonical WBS.

## Required skill loading

Load relevant project skills under `.agents/skills/` before covered work.

- Rental business logic → `car-rental-domain`
- PostgreSQL/PostGIS/schema/query/migration → `postgres-production`
- NestJS/backend/API → `nestjs-production`
- API contracts/OpenAPI/DTOs/idempotency/webhooks → `api-contracts`
- Web/design/accessibility/RTL → applicable frontend/design skills
- Tests/quality gates → `testing-quality`
- Maps/geospatial → `maps-postgis`
- Mobile operations → `mobile-design-system` + `resilient-mobile-ops`
- Financial workflows → `financial-auditability`
- External providers → `integration-connector-architecture`
- Plan execution → `plan-execution`
- External reference review → `agent-skill-security` + `external-reference-registry`
- POS Global patterns → `pos-global-lessons`
- Business application UX → `business-application-ux`

Skills supplement but never override accepted ADRs, security requirements, or product rules.

## Required behavior before coding

- inspect existing implementation;
- search for reusable abstractions;
- identify tenant, authorization, money, booking, concurrency, historical-data, notification and client-contract impact;
- respect the active release boundary;
- prefer the smallest coherent change.

## Required behavior after coding

- run focused tests;
- run typecheck/lint/build where applicable;
- verify migrations/backward compatibility;
- test authorization and tenant isolation;
- perform UI/mobile runtime and visual validation when relevant;
- update docs/ADRs for material changes;
- record evidence and execution state;
- continue automatically to the next eligible WBS task after successful validation.

## Security rules

- Never expose secrets or privileged credentials.
- Never trust client-supplied tenant IDs, roles, ownership, prices, totals, or workflow state.
- Enforce authorization server-side.
- Scope tenant-owned reads/writes/exports/jobs.
- Validate uploaded files and secure private media/document access.
- Avoid sensitive information in logs/errors.

## Financial rules

Use exact monetary representation. Calculate authoritative totals server-side. Preserve historical snapshots. Use audited adjustments instead of rewriting financial history.

## Booking rules

- No conflicting active vehicle bookings.
- Operational blocks can make vehicles unavailable.
- State transitions are explicit and authorized.
- Time zone context is explicit.
- Critical booking/payment/availability operations use safe transaction/concurrency/idempotency patterns.

## UI rules

Use the established KAVRIQO design system. Support Arabic RTL, French and English. Important async interactions need loading/empty/success/error states. Validate responsive and RTL/LTR behavior where affected.

## Reference rules

References are research, not source-of-truth. Do not copy branding, large code blocks, or unrelated architecture. External repositories are not runtime dependencies unless a specific approved task requires them.
