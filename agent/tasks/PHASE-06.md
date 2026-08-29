# PHASE-06 — Pricing Engine

## 06-01 Base/duration pricing
**Depends:** 05-05. **Skills:** car-rental-domain, nestjs-production, testing-quality.
**Acceptance:** hourly/daily/weekly/monthly and duration-tier calculations are server-authoritative and deterministic.

## 06-02 Seasonal/special dates
**Depends:** 06-01. **Skills:** car-rental-domain, postgres-production.
**Acceptance:** seasonal/weekend/holiday/special-date rules have precedence and timezone-aware effective windows.

## 06-03 Discounts/promotions/coupons/extras
**Depends:** 06-02. **Skills:** car-rental-domain, api-contracts, testing-quality.
**Acceptance:** eligibility, stacking, limits, expiry and audit behavior are explicit; client totals cannot override results.

## 06-04 Delivery/distance/deposit/snapshots
**Depends:** 06-03. **Skills:** maps-postgis, financial-auditability, car-rental-domain.
**Acceptance:** fees/deposits and historical snapshots are reproducible and bound to booking context.

## 06-05 Phase gate
**Depends:** 06-04. **Gate:** representative pricing scenarios and regression tests pass with reproducible server totals.
