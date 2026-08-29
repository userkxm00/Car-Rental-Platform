# Autonomous Task Registry

This file is the canonical ordered execution index. There are 19 implementation phases and 95 stable task IDs. Each phase has one canonical task-specification file under `agent/tasks/PHASE-NN.md` containing its five task definitions, dependencies, skills, acceptance checks and gate.

## Execution rule

Execute the current phase's tasks in numeric order. Do not advance while a task or phase gate is failing. The current pointer is stored in `agent/EXECUTION_STATE.md`.

## Phase 01 — Identity & Access
- 01-01 Repository/runtime foundation and environment contract
- 01-02 User identity model and persistence
- 01-03 Sessions/tokens and verification
- 01-04 Roles, permissions, agency/platform authorization
- 01-05 Audit/security tests and Phase 01 gate
- **Spec:** `agent/tasks/PHASE-01.md`

## Phase 02 — Multi-Tenancy & Organization
- 02-01 Agency/tenant and membership model
- 02-02 Branch/location organization model
- 02-03 Server-side tenant context and repository scoping
- 02-04 Cross-tenant isolation test suite
- 02-05 Phase 02 gate
- **Spec:** `agent/tasks/PHASE-02.md`

## Phase 03 — Fleet Foundation
- 03-01 Vehicle categories and vehicle model
- 03-02 Vehicle lifecycle/status/readiness
- 03-03 Documents and expiry rules
- 03-04 Structured vehicle gallery/media
- 03-05 Fleet tests and Phase 03 gate
- **Spec:** `agent/tasks/PHASE-03.md`

## Phase 04 — Availability Engine
- 04-01 Reservation/block interval model
- 04-02 Conflict detection and database safeguards
- 04-03 Scheduler/timeline and availability queries
- 04-04 Concurrency/race-condition tests
- 04-05 Phase 04 gate
- **Spec:** `agent/tasks/PHASE-04.md`

## Phase 05 — Booking Engine
- 05-01 Quote/request creation
- 05-02 Booking state machine and commands
- 05-03 Confirmation/cancellation/no-show/extension
- 05-04 Reassignment/manual/walk-in/idempotency
- 05-05 Phase 05 gate
- **Spec:** `agent/tasks/PHASE-05.md`

## Phase 06 — Pricing Engine
- 06-01 Base/duration pricing
- 06-02 Seasonal/special-date/weekend rules
- 06-03 Discounts/promotions/coupons/extras
- 06-04 Delivery/distance/deposit and historical snapshots
- 06-05 Phase 06 gate
- **Spec:** `agent/tasks/PHASE-06.md`

## Phase 07 — Customer Platform & Marketplace
- 07-01 Customer identity/profile and public agency exposure
- 07-02 Marketplace search/filter/map-list
- 07-03 Agency profiles and vehicle offer pages
- 07-04 Customer quote/checkout/reservation portal
- 07-05 Phase 07 gate
- **Spec:** `agent/tasks/PHASE-07.md`

## Phase 08 — Contracts & Documents
- 08-01 Document requirements and templates
- 08-02 Localized rental agreement generation
- 08-03 Signature/receipt/PDF workflow
- 08-04 Secure document access and history
- 08-05 Phase 08 gate
- **Spec:** `agent/tasks/PHASE-08.md`

## Phase 09 — Payments & Billing
- 09-01 Payment/deposit/partial balance model
- 09-02 Cash/transfer/manual reconciliation
- 09-03 Refunds and financial adjustments
- 09-04 Provider adapter/webhook/idempotency layer
- 09-05 Phase 09 gate
- **Spec:** `agent/tasks/PHASE-09.md`

## Phase 10 — Inspection & Damage
- 10-01 Pickup inspection workflow
- 10-02 Return inspection workflow
- 10-03 Photos/checklists/damage evidence
- 10-04 Damage settlement/audit
- 10-05 Phase 10 gate
- **Spec:** `agent/tasks/PHASE-10.md`

## Phase 11 — Maintenance & Readiness
- 11-01 Service schedules and maintenance records
- 11-02 Maintenance/operational blocking
- 11-03 Cleaning/preparation/readiness workflow
- 11-04 Insurance/registration/inspection reminders
- 11-05 Phase 11 gate
- **Spec:** `agent/tasks/PHASE-11.md`

## Phase 12 — Operations & Platform Control Plane
- 12-01 KPI/attention dashboard
- 12-02 Calendar/fleet intelligence
- 12-03 Revenue/utilization/branch analytics
- 12-04 Reports/exports/reconciliation views
- 12-05 Platform Control Plane (agencies, verification, plans, trials, subscriptions, licenses, entitlements, flags, ads, commissions, moderation/support)
- **Spec:** `agent/tasks/PHASE-12.md`

## Phase 13 — Agency Staff Mobile
- 13-01 Mobile shell/auth/navigation/design system
- 13-02 Daily task/pickup/return workflows
- 13-03 QR/camera/photo/inspection capture
- 13-04 Connectivity/sync status + notification foundation
- 13-05 Phase 13 gate
- **Spec:** `agent/tasks/PHASE-13.md`

## Phase 14 — Customer Mobile (Release 2+)
- 14-01 Mobile foundation and authenticated shell
- 14-02 Search/booking/reservation parity
- 14-03 Digital check-in/QR/support
- 14-04 Cross-client contract tests
- 14-05 Phase 14 gate
- **Spec:** `agent/tasks/PHASE-14.md`

## Phase 15 — Notifications & Automation
- 15-01 Domain event and notification model
- 15-02 Push/email/SMS/WhatsApp adapters
- 15-03 Reminder/overdue/scheduled jobs
- 15-04 Preferences/idempotency/localization
- 15-05 Phase 15 gate
- **Spec:** `agent/tasks/PHASE-15.md`

## Phase 16 — Partners/Loyalty/Referrals
- 16-01 Partner/referral attribution
- 16-02 Loyalty rules and ledger
- 16-03 Commission/reporting model
- 16-04 Abuse/rollback/audit controls
- 16-05 Phase 16 gate
- **Spec:** `agent/tasks/PHASE-16.md`

## Phase 17 — Analytics & AI Assistance
- 17-01 Analytics warehouse/query boundaries
- 17-02 Utilization/profitability/forecasting
- 17-03 Document/inspection AI assistance
- 17-04 Explainability/permissions/human approval
- 17-05 Phase 17 gate
- **Spec:** `agent/tasks/PHASE-17.md`

## Phase 18 — Security & Reliability Hardening
- 18-01 Threat-model remediation
- 18-02 Tenant/permission/security regression suite
- 18-03 Performance/load/abuse testing
- 18-04 Backup/recovery/observability drills
- 18-05 Phase 18 gate
- **Spec:** `agent/tasks/PHASE-18.md`

## Phase 19 — Production Readiness
- 19-01 Critical E2E journey completion
- 19-02 Migration/deployment rehearsal
- 19-03 Mobile/desktop/public-web release validation
- 19-04 Runbooks/incident/rollback/package readiness
- 19-05 Final release gate and completion report
- **Spec:** `agent/tasks/PHASE-19.md`

## Task record policy

The phase task-spec file is canonical until a task starts. During execution, the agent records status/evidence in the task section and `agent/EXECUTION_STATE.md`. If a task grows beyond the phase file's readability, a dedicated `agent/task-records/TASK-ID.md` may be created and linked without changing the stable task ID.
