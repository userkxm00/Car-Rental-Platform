---
name: pos-global-lessons
description: Apply proven architectural and quality patterns from the user's POS Global project when building Car Rental Platform. Use for offline/resilience thinking, auditability, exact-money handling, boundary enforcement, release evidence, and shared-client contracts.
---

# POS Global Lessons

Treat this as a pattern reference only. The Car Rental Platform product and ADRs remain authoritative.

## Apply

- Business mutations that affect money, booking state, vehicle state, deposits, refunds, or balances must be atomic where appropriate.
- Use exact money representations and explicit currency; never use binary floating-point as authoritative financial truth.
- Preserve immutable history. Correct with compensating records rather than silently rewriting financial/operational history.
- Record sensitive operational actions in an auditable trail with actor and timestamps.
- Keep organization/tenant/branch/register-style boundaries explicit; for Car Rental use platform → agency → branch and enforce scope server-side.
- Build retry/idempotency into operations that can be repeated because of mobile connectivity, web retries, or provider webhooks.
- Treat offline/resilient mobile workflows as a deliberate capability, not an excuse to allow unsafe writes. Only explicitly approved workflows may be offline-write capable.
- Keep future web/mobile clients on versioned contracts; do not make business rules desktop/client-specific.
- Prefer hardware/provider abstractions and replaceable adapters over provider-specific domain coupling.
- Require executable evidence for completion: tests, typecheck, lint, build, migration validation, and relevant runtime verification.

## Car Rental adaptations

Apply the ideas to:
- booking/payment/deposit/refund invariants
- vehicle readiness and inspection evidence
- SaaS subscription/license billing records
- agency settlement and marketplace commission records
- operations mobile app with intermittent connectivity
- audit logs and incident reconstruction

Do not copy POS-specific concepts such as cashier shifts, product inventory ledgers, receipt-printer behavior, or Electron/Tauri architecture unless explicitly relevant.

## Review checklist

Before completing a related task, verify:
1. retries cannot create duplicate business outcomes;
2. historical financial/booking truth remains reproducible;
3. authorization and tenant scope are server enforced;
4. offline behavior is explicit and safe;
5. tests cover crash/retry/concurrency paths where risk exists;
6. docs are updated when behavior or architecture changes.

Source reference: https://github.com/userkxm00/pos-global
