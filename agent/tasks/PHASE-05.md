# PHASE-05 — Booking Engine

## 05-01 Quote/request creation
**Depends:** 04-05. **Skills:** car-rental-domain, nestjs-production, api-contracts.
**Acceptance:** quote/request captures agency, vehicle/offer, times, locations and immutable request context; server validates availability.

## 05-02 State machine/commands
**Depends:** 05-01. **Skills:** car-rental-domain, nestjs-production, testing-quality.
**Acceptance:** explicit valid transitions, authorization and audit events; no direct arbitrary status mutation.

## 05-03 Confirm/cancel/no-show/extension
**Depends:** 05-02. **Skills:** car-rental-domain, postgres-production, testing-quality.
**Acceptance:** each command rechecks rules, handles conflicts, preserves history and recalculates extension pricing server-side.

## 05-04 Manual/walk-in/reassignment/idempotency
**Depends:** 05-03. **Skills:** car-rental-domain, api-contracts, pos-global-lessons.
**Acceptance:** direct, phone and walk-in bookings use same domain rules; retries are safe; vehicle reassignment is audited.

## 05-05 Phase gate
**Depends:** 05-04. **Gate:** lifecycle, concurrency, idempotency, authorization and audit tests pass; evidence recorded.
