# Development Phases

The implementation is intentionally staged. The autonomous agent executes the ordered tasks in `agent/TASK_REGISTRY.md`; each phase has five tasks with canonical specifications under `agent/tasks/PHASE-NN.md`.

## Phase completion gate

A phase is complete only when all five tasks are DONE and:
- scope is implemented;
- relevant business rules are satisfied;
- database/migrations are reviewed;
- authorization/tenant isolation are reviewed;
- API behavior is validated;
- critical error paths are handled;
- automated tests pass;
- type/lint/build checks pass;
- documentation/evidence are updated;
- no known critical security/financial/booking defect remains.

## Phase 00 — Foundation & Architecture

**Status: FROZEN — Release 1 Core Architecture**

Repository conventions, stack/ADRs, domain/database design, booking/availability/pricing invariants, security/tenancy, marketplace/SaaS/monetization model, release scope, observability/testing baseline and autonomous execution system are frozen. Provider choices are made inside approved adapters when their implementation phase requires them.

## Phase 01 — Identity and Access

Authentication, sessions, user identity, roles, permissions, platform/agency scopes, verification, MFA where required, device/session management and privileged-action auditing.

## Phase 02 — Multi-Tenancy and Organization

Agencies/tenants, branches, locations, organization settings, server-side tenant context and isolation regression tests.

## Phase 03 — Fleet Foundation

Vehicle categories, vehicles, lifecycle/status, mileage/fuel, documents/expiry and structured gallery/media.

## Phase 04 — Availability Engine

Reservation/block intervals, conflict protection, scheduler/timeline, availability APIs and concurrency testing.

## Phase 05 — Booking Engine

Quotes/requests, explicit lifecycle/state machine, confirmation/cancellation/no-show/extension, manual/walk-in/phone booking, reassignment and idempotency.

## Phase 06 — Pricing Engine

Base/duration, seasonal/special-date/weekend rules, discounts/promotions/coupons/extras, delivery/distance/deposit fees and historical price snapshots.

## Phase 07 — Customer Platform & Marketplace

Customer profile, cross-agency search, Map/List discovery, agency profiles, agency-owned offers, quote/checkout/reservation portal, reviews/comments and support entry points.

## Phase 08 — Contracts and Documents

Document requirements, localized/versioned contracts, signatures, receipts/PDFs and secure document access/history.

## Phase 09 — Payments and Billing

Rental payment/deposit/balance model, cash/transfer/manual reconciliation, refunds/adjustments and provider/webhook/idempotency adapters. Agency SaaS billing remains a separate financial domain.

## Phase 10 — Inspection and Damage

Pickup/return inspections, structured evidence/photos, damage records, settlement workflow and audit trail.

## Phase 11 — Maintenance and Vehicle Readiness

Service schedules, maintenance records/blocks, cleaning/preparation, readiness and compliance reminders.

## Phase 12 — Operations & Platform Control Plane

Agency KPI/attention dashboard, calendar/fleet intelligence, revenue/utilization analytics, reports/exports, plus Platform Owner management of agencies, verification, plans, trials, subscriptions, licenses, entitlements, feature flags, ads, commission rules, moderation and support oversight.

## Phase 13 — Agency Mobile Operations

Agency mobile shell/auth/design system, pickup/return, QR/camera/photos/inspection, safe connectivity/sync and minimum notification foundation.

## Phase 14 — Customer Mobile App (Release 2+)

Customer mobile foundation, search/booking parity, check-in/QR/support and cross-client contract tests.

## Phase 15 — Notifications and Automation

Full event-driven notification platform, push/email/SMS/WhatsApp adapters, reminders, scheduled jobs, preferences and localization/idempotency.

## Phase 16 — Partners, Loyalty, Referrals

Partner/referral attribution, loyalty ledger, commissions/reporting and abuse/rollback/audit controls.

## Phase 17 — Analytics and AI Assistance

Authorized analytics boundary, utilization/profitability/forecasting, AI document/inspection assistance and explainable human-approved decision support.

## Phase 18 — Security Hardening and Reliability

Threat remediation, security/tenant regression, performance/load/abuse testing, backup/recovery and observability drills.

## Phase 19 — Production Readiness

Critical E2E journeys, migration/deployment rehearsal, mobile/web release validation, runbooks, rollback/readiness and final release gate.

## Global Agent rule

Implement the active phase and explicit dependencies only. Use `agent/EXECUTION_STATE.md` as the resume pointer. Do not invent a new task order. Future features may have interfaces/adapters, but are not implemented early merely because the architecture supports them.
