# PHASE-04 — Availability Engine

## 04-01 Reservation/block intervals
**Depends:** 03-05. **Skills:** car-rental-domain, postgres-production.
**Acceptance:** authoritative time-bounded reservation and operational-block model exists; timezone semantics are explicit.

## 04-02 Conflict protection
**Depends:** 04-01. **Skills:** postgres-production, nestjs-production.
**Acceptance:** PostgreSQL constraints/locking and transaction strategy prevent overlapping active commitments.

## 04-03 Scheduler/search availability
**Depends:** 04-02. **Skills:** car-rental-domain, api-contracts, frontend-design, data-dense-ux.
**Acceptance:** calendar/timeline and API return consistent computed availability for agency and marketplace use.

## 04-04 Concurrency tests
**Depends:** 04-03. **Skills:** testing-quality, postgres-production.
**Acceptance:** concurrent booking/block requests, retries and conflict races are tested under realistic transactions.

## 04-05 Phase gate
**Depends:** 04-04. **Gate:** no conflicting commitments can be created; all impacted tests and builds pass; evidence recorded.
