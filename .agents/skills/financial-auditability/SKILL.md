---
name: financial-auditability
description: Design and review financial flows for exact amounts, immutable transaction history, deposits, refunds, balances, reconciliation, and auditability. Use for payments, billing, deposits, agency settlements, platform subscriptions, commissions, and reports.
---

# Financial Auditability

## Core rules
- Never use binary floating-point as the persisted financial source of truth.
- Store the currency with every monetary record.
- Compute authoritative totals server-side.
- Preserve the historical inputs/rules that produced a booking or invoice total.
- Do not overwrite financial facts to “fix” history; use explicit adjustment/refund/reversal records.
- Make retries/idempotency part of payment and webhook design.
- Separate customer→agency money from agency→platform money and platform advertising revenue.

## Reconciliation
For every material financial workflow, define:
- source of truth
- expected balance
- recorded transactions
- adjustments
- reconciliation status
- actor and timestamp
- evidence/reference when manual

## Reporting
Reports must derive from authoritative financial records, not mutable UI state or cached counters alone.

## Audit
Sensitive actions require audit events, including manual payment approval, refund, deposit adjustment, subscription extension, license grant, commission changes, and financial corrections.

## Car-rental examples
- Deposit held/released/refunded.
- Partial payment + outstanding balance.
- Damage charge added after return through an explicit settlement flow.
- Marketplace commission snapshot without corrupting the agency's rental price.
