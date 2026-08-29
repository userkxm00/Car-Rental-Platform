# PHASE-09 — Payments & Billing

## 09-01 Payment/deposit/balance model
**Depends:** 08-05. **Skills:** financial-auditability, car-rental-domain, postgres-production.
**Acceptance:** rental payments, deposits, balances and payment states are separate, exact and auditable.

## 09-02 Cash/transfer/manual reconciliation
**Depends:** 09-01. **Skills:** financial-auditability, nestjs-production, api-contracts.
**Acceptance:** cash/bank/manual flows support references, evidence, reconciliation and tenant-safe permissions.

## 09-03 Refunds/adjustments
**Depends:** 09-02. **Skills:** financial-auditability, testing-quality.
**Acceptance:** no destructive financial rewrites; refunds/adjustments are append-oriented, authorized and auditable.

## 09-04 Provider/webhook/idempotency layer
**Depends:** 09-03. **Skills:** integration-connector-architecture, api-contracts, testing-quality.
**Acceptance:** provider adapters, verified webhooks and duplicate-event handling are isolated and safe; online customer payment remains optional.

## 09-05 Phase gate
**Depends:** 09-04. **Gate:** financial records reconcile, retries/webhooks are idempotent, and provider failure cannot corrupt booking truth.
