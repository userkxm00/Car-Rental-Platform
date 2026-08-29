# PHASE-10 — Inspection & Damage

## 10-01 Pickup inspection
**Depends:** 09-05. **Skills:** car-rental-domain, mobile-design-system, testing-quality.
**Acceptance:** pickup inspection binds to booking/vehicle/staff and records required condition facts.

## 10-02 Return inspection
**Depends:** 10-01. **Skills:** car-rental-domain, mobile-design-system, testing-quality.
**Acceptance:** return inspection captures comparison context and closes/flags the rental safely.

## 10-03 Evidence capture
**Depends:** 10-02. **Skills:** resilient-mobile-ops, integration-connector-architecture, rtl-i18n-quality.
**Acceptance:** mileage, fuel, checklist, structured photos and damage evidence are stored privately and immutably where required.

## 10-04 Damage settlement
**Depends:** 10-03. **Skills:** financial-auditability, car-rental-domain, testing-quality.
**Acceptance:** damage findings, review, customer communication and financial settlement are separate audited steps.

## 10-05 Phase gate
**Depends:** 10-04. **Gate:** rental evidence is reproducible; damage cannot silently become liability/financial truth without authorized workflow.
