# 10 — Booking State Machine

## Principle
Booking status is not a free-form field. Only explicit, documented transitions are allowed.

## States

```text
DRAFT
  ↓
QUOTED
  ↓
PENDING_CONFIRMATION
  ├──→ EXPIRED
  ├──→ CANCELLED
  └──→ CONFIRMED
           ↓
       PREPARING
           ↓
        CHECKED_OUT
           ↓
       IN_RENTAL
           ├──→ EXTENSION_PENDING → IN_RENTAL
           └──→ OVERDUE
                    ↓
                 RETURNING
                    ↓
              INSPECTION_PENDING
                    ↓
              SETTLEMENT_PENDING
                    ↓
                COMPLETED
```

## Exception states

- Payment failed/could not be confirmed is represented through payment state and may block booking transition rather than inventing many booking statuses.
- No-show is a documented terminal/business outcome when policy requires it.
- Disputed damage is represented by damage/settlement state, not by corrupting booking history.

## Transition requirements

For every transition define:
- allowed source states
- actor/permission
- preconditions
- database transaction boundary
- side effects/events
- audit event
- notification behavior
- failure behavior

## Examples

### Confirm
Allowed from `PENDING_CONFIRMATION` only when:
- required customer data is present
- inventory is still available
- current pricing rules allow confirmation
- required payment/deposit condition is satisfied

### Check out
Allowed only after required pickup preparation and inspection/document conditions are satisfied.

### Return
Records final mileage/fuel/condition and moves into inspection/readiness/settlement workflow.

### Complete
Allowed only after required operational and financial settlement conditions are satisfied according to agency policy.

## Rules

- Clients cannot directly set a status.
- Staff cannot use a UI shortcut to bypass required transitions.
- Platform administrators do not silently mutate agency booking states outside an audited support procedure.
- Every material transition is auditable.
