---
name: car-rental-domain
description: Apply the Car Rental Platform's domain rules and workflows when implementing or reviewing vehicles, agencies, branches, bookings, availability, pricing, rentals, inspections, damage, maintenance, payments, marketplace, reviews, or agency operations. Use this skill before changing business logic in any rental domain.
---

# Car Rental Domain Skill

## Authority

Treat the repository's `docs/` and `architecture/` specifications as the source of truth. Treat external repositories as research only.

Before changing domain logic, read the relevant domain specification and business rules. Do not invent behavior that is not documented when a documented rule exists.

## Non-negotiable invariants

- A vehicle cannot have overlapping incompatible commitments.
- Availability is computed from reservations, rentals, maintenance, inspection/readiness, damage, transfers, and manual blocks; never trust a single boolean.
- Booking transitions are explicit domain commands, not arbitrary status updates.
- Booking confirmation, assignment, and extension are concurrency-sensitive.
- Authoritative money is calculated server-side.
- Historical booking/commercial facts remain reproducible through snapshots.
- Tenant scope is derived server-side for every protected operation.
- Customer-visible marketplace offers must identify the responsible agency.
- Reviews are tied to qualifying rental experiences.
- Pickup/return inspections are first-class evidence workflows.

## Workflow

1. Identify the affected domain and read its specification.
2. Check related invariants and cross-domain dependencies.
3. Model the change as a domain operation/command.
4. Validate authorization and tenant scope.
5. Handle transaction/concurrency implications.
6. Persist audit/history when required.
7. Add/update unit, integration, and E2E tests.
8. Update the relevant documentation and ADR if architecture changes.

## Marketplace rules

Customer search may cross participating agencies, but agency-owned operational data remains tenant-scoped. Agency profile data can be public only according to explicit exposure settings. Ranking may use documented signals; sponsored placement must never masquerade as neutral ranking.

## Regional rules

Preserve Arabic/French/English and RTL requirements. Keep DZD primary but do not hard-code DZD into domain algorithms. Support cash, bank transfer, pay-at-agency, deposits, and manual reconciliation before assuming an online gateway.

## Never

- Never put critical rental logic only in UI code.
- Never let the client choose authoritative totals, permissions, tenant IDs, or booking states.
- Never silently change a confirmed booking because current pricing changed.
- Never use an external reference repository as the product specification.
