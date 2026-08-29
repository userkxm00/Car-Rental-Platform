# PHASE-16 — Partners, Loyalty & Referrals

## 16-01 Partner/referral attribution
**Depends:** 15-05. **Acceptance:** referral codes/links and attribution are deterministic and tenant/platform scoped.

## 16-02 Loyalty ledger
**Depends:** 16-01. **Acceptance:** points/benefits use an auditable ledger with explicit earning/redemption rules and no mutable balance-only truth.

## 16-03 Commission/reporting
**Depends:** 16-02. **Acceptance:** partner commissions/reports reconcile to source events and historical rules.

## 16-04 Abuse/rollback/audit
**Depends:** 16-03. **Skills:** financial-auditability, testing-quality.
**Acceptance:** fraud/abuse limits, reversal/rollback and privileged changes are audited.

## 16-05 Phase gate
**Depends:** 16-04. **Gate:** attribution, loyalty and commissions are reproducible and auditable.
