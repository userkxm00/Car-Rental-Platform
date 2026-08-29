# Architecture Freeze — Readiness Gate

## Current status

**NOT FROZEN — final review required before implementation.**

## Completed baseline

- product surfaces and Release 1 scope
- Customer Web as Release 1 customer experience
- Agency Operations Mobile as Release 1 native app
- Owner/Admin Web
- Platform Owner Web control center
- future Customer App deferred to Release 2+
- modular monolith direction
- PostgreSQL + PostGIS decision
- Prisma data-access direction
- NestJS + TypeScript backend direction
- tenant model
- role/permission model
- business rules foundation
- booking/availability/pricing domain boundaries
- map/location model
- licensing/entitlement architecture
- mobile distribution strategy
- security threat model
- API/error model
- infrastructure/deployment baseline
- testing/quality gates
- architecture ADRs

## Freeze blockers

The following must be reviewed and accepted before coding the production schema/application foundation:

1. Final physical database schema and relationship review.
2. Exact vehicle/category reservation model.
3. Final booking state machine and cancellation/no-show policy matrix.
4. Final availability interval/conflict strategy, including PostgreSQL exclusion/locking approach.
5. Final pricing calculation specification and rounding/currency policy.
6. Concrete authentication provider selection.
7. Final permission catalog and privileged-action policy.
8. Map provider selection for initial release and geocoding/autocomplete/routing adapters.
9. Object storage provider and document retention policy.
10. Payment provider roadmap for Algeria/Maghreb and manual reconciliation workflow.
11. API resource/command catalog and OpenAPI generation strategy.
12. Final observability and backup/RPO/RTO targets.
13. Complete critical-path test matrix.

## Freeze rule

No implementation task may silently change one of the above. A changed decision requires a documented ADR/update before implementation proceeds.

## Implementation gate

When all blockers are accepted:

`Architecture Status → FROZEN FOR RELEASE 1`

Then the team may create the initial monorepo, configuration, NestJS API, Prisma schema/migrations, web/mobile shells, CI, and Phase 01 identity implementation according to the approved documents.
