# PHASE-12 — Operations & Platform Control Plane

## 12-01 Agency KPI/attention center
**Depends:** 11-05. **Skills:** business-application-ux, data-dense-ux, frontend-design, visual-qa.
**Acceptance:** owner dashboard highlights actionable exceptions and metrics come from authoritative data.

## 12-02 Calendar/fleet intelligence
**Depends:** 12-01. **Skills:** data-dense-ux, car-rental-domain, frontend-design.
**Acceptance:** calendar, fleet status and upcoming work are consistent with booking/availability truth.

## 12-03 Revenue/utilization/branch analytics
**Depends:** 12-02, 09-05. **Skills:** financial-auditability, data-dense-ux, testing-quality.
**Acceptance:** revenue, balances, utilization and branch views reconcile to source records.

## 12-04 Reports/exports
**Depends:** 12-03. **Skills:** business-application-ux, api-contracts, testing-quality.
**Acceptance:** reports/export filters are tenant/permission scoped and large exports are safe/audited.

## 12-05 Platform Control Plane
**Depends:** 12-04. **Skills:** business-application-ux, financial-auditability, nestjs-production, testing-quality.
**Acceptance:** Platform Admin can manage agency lifecycle, verification, plans, trials, subscriptions, licenses, entitlements, feature flags, ad configuration, commission configuration, moderation/support oversight; sensitive actions are audited.

## Phase gate
All agency dashboards and Platform Control Plane functions pass data reconciliation, authorization, tenant isolation, accessibility and build/test gates.
