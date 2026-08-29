# 11 — Booking Engine Specification

## Scope
The booking engine is the authoritative workflow for online, manual, phone and walk-in rentals.

## Reservation modes

- Online customer booking
- Staff/manual booking
- Phone booking
- Walk-in booking
- Future partner/API bookings

All modes use the same core pricing, availability and lifecycle rules.

## Core flow

```text
Search
 → Quote
 → Customer details
 → Document requirements
 → Availability recheck
 → Price calculation
 → Payment/deposit step
 → Booking creation
 → Confirmation
 → Pickup
 → Active rental
 → Return
 → Settlement
 → Completed
```

## Booking states

See `docs/10-booking-state-machine.md`.

## Quote rules

A quote contains:
- requested pickup/return locations
- requested interval
- vehicle/category selection
- rate context
- extras
- fees
- deposit requirement
- currency
- total
- expiration timestamp

Quote values are generated server-side and can expire.

## Vehicle assignment

The system may book a specific vehicle or a category depending on configuration.

If category booking is used, the availability engine reserves category capacity and assigns a physical vehicle before pickup according to agency policy.

## Concurrency

Two concurrent requests must not both confirm the same inventory interval.

Implementation must combine transaction boundaries with database-level protection appropriate for the final interval model.

## Idempotency

Create, confirm, payment callback and extension commands must support safe retries where duplicate execution would be harmful.

Use an idempotency key tied to the authenticated actor and command type. Replayed requests return the original result where safe.

## Cancellation

Cancellation requires:
- valid current state
- actor authorization
- policy evaluation
- refund/fee calculation when applicable
- status history/audit

## Extension

Extension creates a new requested interval and re-runs availability and pricing for the additional time.

The existing confirmed pricing snapshot is preserved. The extension produces a distinct financial adjustment/line item.

## Pickup and return linkage

A booking may have one operational pickup and one primary return workflow, with explicit handling for reassignment/alternate location where supported.

## Historical integrity

A completed booking must remain explainable later without relying on mutable current pricing/configuration.

Preserve:
- vehicle/category identity snapshot as required
- rate and pricing components
- taxes/fees
- location context
- customer/contract references
- payment allocations
- inspection references
- status history

## Operational rules

A booking may require preparation tasks before pickup. Returned vehicles may remain blocked until readiness is completed.

## Acceptance criteria

- No confirmed overlap for a physical vehicle.
- Manual and online bookings use the same engine.
- Every confirmation stores a pricing snapshot.
- Retry cannot create duplicate confirmed bookings.
- Extension cannot bypass availability.
- Cancellation is policy-driven and auditable.
- Tenant isolation works for all booking operations.
