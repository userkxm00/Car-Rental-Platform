# PHASE-17 — Analytics & AI Assistance

## 17-01 Authorized analytics boundary
**Depends:** 16-05. **Acceptance:** analytics queries use authorized tenant-scoped sources and do not expose raw restricted data.

## 17-02 Utilization/profitability/forecasting
**Depends:** 17-01. **Skills:** data-dense-ux, financial-auditability, testing-quality.
**Acceptance:** KPIs, utilization, profitability and forecasts reconcile to source data with documented assumptions.

## 17-03 Document/inspection AI assistance
**Depends:** 17-02. **Skills:** integration-connector-architecture, car-rental-domain, security-review.
**Acceptance:** AI assists extraction/comparison only within explicit permissions and stores provenance/confidence.

## 17-04 Explainability/human approval
**Depends:** 17-03. **Acceptance:** AI cannot silently mutate financial/booking/liability truth; sensitive recommendations require human approval.

## 17-05 Phase gate
**Depends:** 17-04. **Gate:** analytics are authorized/reproducible and AI is bounded, explainable and non-authoritative for critical decisions.
