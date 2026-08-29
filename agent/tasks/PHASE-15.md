# PHASE-15 — Notifications & Automation

## 15-01 Domain events/notification model
**Depends:** 14-05. **Acceptance:** domain events and notification records are tenant-safe, deduplicable and traceable.

## 15-02 Delivery adapters
**Depends:** 15-01. **Skills:** integration-connector-architecture, api-contracts.
**Acceptance:** push/email/SMS/WhatsApp adapters are replaceable and provider failures are isolated.

## 15-03 Scheduled reminders/jobs
**Depends:** 15-02. **Skills:** nestjs-production, testing-quality.
**Acceptance:** reminders, overdue notifications and scheduled jobs are retry-safe and observable.

## 15-04 Preferences/idempotency/localization
**Depends:** 15-03. **Skills:** rtl-i18n-quality, testing-quality.
**Acceptance:** notification preferences, templates and idempotency work for Arabic/French/English without tenant leaks.

## 15-05 Phase gate
**Depends:** 15-04. **Gate:** all required channels/events are localized, safe, observable and idempotent.
