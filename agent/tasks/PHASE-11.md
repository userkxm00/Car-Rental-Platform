# PHASE-11 — Maintenance & Readiness

## 11-01 Service schedules/records
**Depends:** 10-05. **Skills:** car-rental-domain, postgres-production.
**Acceptance:** maintenance plans, service records, costs and due dates are tenant-scoped and auditable.

## 11-02 Operational blocks
**Depends:** 11-01. **Skills:** car-rental-domain, postgres-production, testing-quality.
**Acceptance:** maintenance/damage/document blockers feed availability and cannot be bypassed by UI state.

## 11-03 Cleaning/preparation/readiness
**Depends:** 11-02. **Skills:** car-rental-domain, mobile-design-system, data-dense-ux.
**Acceptance:** returned vehicles have explicit readiness tasks/status and unsafe rentals are blocked.

## 11-04 Compliance reminders
**Depends:** 11-03. **Skills:** car-rental-domain, testing-quality.
**Acceptance:** insurance/registration/inspection expiries create actionable reminders and appropriate blocks.

## 11-05 Phase gate
**Depends:** 11-04. **Gate:** configured readiness blockers prevent incorrect rental availability and records remain auditable.
