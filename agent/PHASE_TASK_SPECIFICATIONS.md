# Phase Task Specifications — Autonomous Execution

This file defines the implementation intent and gates for the remaining phases. `agent/TASK_REGISTRY.md` is the canonical task sequence. The agent must not invent a different sequence without documenting why.

## Phase 02 — Multi-Tenancy & Organization
- 02-01 Agency/tenant and membership model.
- 02-02 Branches, locations and organization settings.
- 02-03 Server-side tenant/branch context and scoped repositories.
- 02-04 Negative tests for cross-tenant read/write/export.
- 02-05 Gate: isolation proven by tests and authorization checks.

## Phase 03 — Fleet Foundation
- 03-01 Vehicle categories and vehicles.
- 03-02 Vehicle lifecycle, operational status and readiness blockers.
- 03-03 Vehicle documents, expiry and compliance metadata.
- 03-04 Structured gallery/media with secure storage references.
- 03-05 Gate: coherent vehicle lifecycle and queryable blockers.

## Phase 04 — Availability Engine
- 04-01 Reservation and operational-block interval model.
- 04-02 Conflict detection and database safeguards.
- 04-03 Scheduler/timeline and search availability API.
- 04-04 Concurrent request/race-condition tests.
- 04-05 Gate: overlapping commitments cannot be created.

## Phase 05 — Booking Engine
- 05-01 Quote/request creation.
- 05-02 Explicit booking state machine and commands.
- 05-03 Confirmation, cancellation, no-show and extension.
- 05-04 Manual/walk-in/phone booking, reassignment and idempotency.
- 05-05 Gate: state transitions, concurrency and retry behavior pass.

## Phase 06 — Pricing Engine
- 06-01 Base and duration pricing.
- 06-02 Seasonal/special-date/weekend pricing.
- 06-03 Discounts, promotions, coupons and extras.
- 06-04 Delivery/distance/after-hours fees, deposits and historical snapshots.
- 06-05 Gate: server-authoritative reproducible totals.

## Phase 07 — Customer Platform & Marketplace
- 07-01 Customer account/profile plus public agency exposure controls.
- 07-02 Marketplace search, filters and Map/List results.
- 07-03 Agency public profiles and agency-owned vehicle offer pages.
- 07-04 Quote/checkout/reservation portal, reviews/comments and support entry points.
- 07-05 Gate: customer can discover, compare, book and retrieve a reservation safely.

## Phase 08 — Contracts & Documents
- 08-01 Document requirements and versioned templates.
- 08-02 Localized rental agreements.
- 08-03 Signature, receipts and PDFs.
- 08-04 Secure document access and historical reproducibility.
- 08-05 Gate: signed/history records are protected and reproducible.

## Phase 09 — Payments & Billing
- 09-01 Payment/deposit/balance model.
- 09-02 Cash, transfer and manual reconciliation.
- 09-03 Refunds and financial adjustments.
- 09-04 Provider adapters, webhooks and idempotency.
- 09-05 Gate: financial records are auditable and duplicate events are safe.

## Phase 10 — Inspection & Damage
- 10-01 Pickup inspection.
- 10-02 Return inspection.
- 10-03 Checklist, mileage, fuel, structured photos and damage evidence.
- 10-04 Damage settlement and audit trail.
- 10-05 Gate: evidence and liability workflow are preserved.

## Phase 11 — Maintenance & Readiness
- 11-01 Maintenance/service schedules and records.
- 11-02 Operational blocks and readiness constraints.
- 11-03 Cleaning/preparation/readiness workflow.
- 11-04 Insurance/registration/inspection reminders.
- 11-05 Gate: blocked vehicles cannot be rented incorrectly.

## Phase 12 — Owner Operations Dashboard
- 12-01 KPI and exception/attention center.
- 12-02 Calendar and fleet intelligence.
- 12-03 Revenue, utilization and branch analytics.
- 12-04 Reports and exports.
- 12-05 Gate: dashboard metrics reconcile to source data.

## Phase 13 — Agency Staff Mobile
- 13-01 Mobile shell/auth/navigation/design system.
- 13-02 Pickup/return operational workflows.
- 13-03 QR, camera, photo and inspection capture.
- 13-04 Connectivity/sync status and safe retries.
- 13-05 Gate: real pickup/return workflow succeeds on supported devices.

## Phase 14 — Customer Mobile (Release 2+)
- 14-01 Mobile foundation/auth shell.
- 14-02 Search/booking/reservation parity.
- 14-03 Digital check-in/QR/support.
- 14-04 Cross-client contract tests.
- 14-05 Gate: web/mobile authority remains consistent.

## Phase 15 — Notifications & Automation
- 15-01 Domain event and notification model.
- 15-02 Push/email/SMS/WhatsApp adapters.
- 15-03 Reminder/overdue/scheduled jobs.
- 15-04 Preferences, idempotency and localization.
- 15-05 Gate: notifications are localized, safe and idempotent.

## Phase 16 — Partners/Loyalty/Referrals
- 16-01 Partner/referral attribution.
- 16-02 Loyalty rules and ledger.
- 16-03 Commission/reporting model.
- 16-04 Abuse, rollback and audit controls.
- 16-05 Gate: attribution and commissions reconcile.

## Phase 17 — Analytics & AI Assistance
- 17-01 Analytics boundaries and authorized query layer.
- 17-02 Utilization/profitability/forecasting.
- 17-03 Document and inspection AI assistance.
- 17-04 Explainability, permission and explicit human approval.
- 17-05 Gate: AI cannot silently mutate critical truth or bypass authorization.

## Phase 18 — Security & Reliability Hardening
- 18-01 Threat-model remediation.
- 18-02 Tenant/permission/security regression suite.
- 18-03 Performance/load/abuse testing.
- 18-04 Backup/recovery/observability drills.
- 18-05 Gate: security and recovery checks pass.

## Phase 19 — Production Readiness
- 19-01 Critical customer/agency E2E journeys.
- 19-02 Migration and deployment rehearsal.
- 19-03 Desktop/mobile/public-web release validation.
- 19-04 Runbooks, incident response, rollback and package readiness.
- 19-05 Gate: final release acceptance and completion report.

## Universal task Definition of Done
Every task must leave the repository buildable, tested and documented. Relevant security, authorization, tenant, concurrency, migration, accessibility, localization and runtime checks must pass. Evidence must be recorded before the task is marked DONE.
