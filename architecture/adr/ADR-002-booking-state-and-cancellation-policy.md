# ADR-002 — Release 1 Booking State Machine & Cancellation Policy

## Status
Accepted — 2026-08-29

## Decision

The booking engine uses an explicit command/state model. Agency-specific policy values are configurable, but the lifecycle states and safety invariants are centralized.

## Core states

```text
DRAFT
  ↓
HOLD
  ↓
PENDING_CONFIRMATION
  ↓
CONFIRMED
  ↓
READY_FOR_PICKUP
  ↓
ACTIVE
  ↓
RETURN_PENDING
  ↓
RETURNED
  ↓
SETTLEMENT_PENDING
  ↓
COMPLETED
```

Terminal / exceptional states:

```text
REJECTED
EXPIRED
CANCELLED
NO_SHOW
```

Extension is a command/history operation and does not replace the original booking interval. Vehicle reassignment is also recorded as history.

## State rules

- HOLD is short-lived and expires automatically.
- PENDING_CONFIRMATION is used when an agency must approve a request.
- CONFIRMED consumes the applicable inventory commitment.
- READY_FOR_PICKUP means the agency has completed required preparation/document prerequisites.
- ACTIVE begins only after authorized pickup/check-in.
- RETURN_PENDING represents a rental that has reached its scheduled return workflow.
- RETURNED is set after authorized return/check-out capture.
- SETTLEMENT_PENDING is used until final charges, deposit and adjustments are resolved.
- COMPLETED is immutable business completion; corrections use auditable adjustment records.
- No transition may bypass required authorization or prerequisite checks.

## Expiration

- Unconfirmed holds expire automatically at their configured expiry time.
- The expiration job must be idempotent.
- Expired holds release only the resources associated with the hold.

## Customer cancellation

The platform supports configurable agency cancellation policies using effective-dated policy versions.

Baseline Release 1 behavior:

### Before confirmation

A customer request/hold can be cancelled without a rental cancellation fee unless the configured agency policy explicitly applies a fee to the hold/request.

### After confirmation and before pickup

Cancellation outcome is calculated from the applicable policy version using the time-to-pickup window.

The policy can define:
- free cancellation window
- partial deposit forfeiture
- fixed cancellation fee
- percentage cancellation fee
- manual-review threshold

### During active rental

This is not treated as an ordinary cancellation. It is an early-return/early-termination operation with a separate financial calculation and audit trail.

## Agency cancellation

Agency cancellation is always recorded with:
- actor
- reason
- timestamp
- policy context
- customer notification result
- financial outcome

If the agency cancels after confirmation, the default product behavior is a full reversal of customer-paid amounts that are refundable under the booking policy, with any exceptional dispute handled manually.

Agency-specific exceptions must be explicit and auditable.

## No-show

If the customer does not complete pickup within the configured grace window:

```text
CONFIRMED / READY_FOR_PICKUP
        ↓
NO_SHOW
```

The grace period is policy-configurable by agency, with a Release 1 default that can be changed in agency settings.

No-show financial treatment follows the configured cancellation/deposit policy and is recorded separately from ordinary cancellation.

## Invalid transitions

The backend must reject transitions not explicitly defined by the state machine. The client cannot set arbitrary target states.

## Concurrency

Confirmation, assignment, extension and release of inventory are concurrency-sensitive operations and must use the database/transaction protections defined by the availability architecture.

## Audit

Every state transition stores:
- from state
- to state
- actor
- reason/context
- timestamp
- correlation/idempotency key where applicable

## Consequences

The booking lifecycle is predictable for web, mobile and agency operations while allowing each agency to configure reasonable commercial cancellation behavior without changing the state machine.
