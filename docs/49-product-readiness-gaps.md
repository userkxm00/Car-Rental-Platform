# 49 — Product Readiness Gaps & Decisions

This file records gaps found during the repository audit and the resolution so the implementation agent has one clear answer.

## Resolved before implementation

- Architecture freeze status is unified as **FROZEN — Release 1 Core Architecture**.
- Provider selection is an implementation decision behind approved abstractions, not a reason to redesign the core.
- Platform Control Plane is explicitly part of Phase 12.
- Minimal mobile notification capability is part of Phase 13; full notification/automation platform is Phase 15.
- GTM, support/onboarding/training and legal/privacy baselines are now documented.
- Phase task specifications are canonical under `agent/tasks/PHASE-NN.md`.

## Provider policy

The agent must select concrete providers only when their phase requires them and record the decision. Current architecture remains provider-neutral for auth, maps/geocoding, storage, messaging and payment.

## Release 1 must-have operational policies

The implementation must explicitly handle:
- booking request timeout/hold expiry;
- customer cancellation and agency cancellation reasons;
- no-show;
- late return;
- vehicle unavailable after booking;
- vehicle reassignment;
- refund/adjustment authorization;
- agency response timeout where marketplace booking requires acceptance;
- stale marketplace listings;
- zero-result search UX;
- review eligibility and moderation;
- secure document/media retention and access.

These are domain/task acceptance concerns, not permission to expand Release 1 beyond the approved scope.

## Not blockers for starting code

- exact commercial prices;
- future Google Ads revenue amount;
- future Chargily activation;
- future customer mobile design details;
- future loyalty/partner rules;
- future AI model/vendor.

These remain configurable/future decisions and must not be invented as hard-coded business rules.
