# 47 — Support, Onboarding & Training

## Objective

Make agency adoption operable without developer intervention and provide a structured support model for pilot and production.

## Agency onboarding

Target flow:

Invitation/contact → account → agency profile → branch/location → first vehicle → documents/media → pricing/policies → marketplace publishing → first booking.

The onboarding wizard must save progress safely and show completion status.

## Self-service help

Provide:
- contextual help links;
- searchable help center;
- setup checklists;
- short videos/guides where useful;
- billing/renewal instructions;
- common troubleshooting.

## Support model

Support channels may include in-app ticketing, email and a configured WhatsApp/business contact. Contact values are Platform Admin settings, not hard-coded secrets.

## Severity

- P0: security/data loss/booking or financial corruption risk.
- P1: major workflow unavailable for a tenant/customer.
- P2: degraded non-critical function.
- P3: question, cosmetic issue or enhancement.

## Operational targets

Exact SLA values are commercial decisions. The system should capture severity, timestamps, assignee, status, first response and resolution time so SLAs can be measured later.

## Support boundaries

Support agents must not gain unrestricted tenant access. Any support impersonation or sensitive access requires explicit permission, reason, audit event and least-privilege tooling.

## Training

Provide role-based onboarding for Owner, Manager, Staff and Finance. Teach booking lifecycle, inspections, payments, maintenance, reports, and privacy/security practices.

## Pilot feedback

Collect structured feedback from each pilot agency. Distinguish bugs, usability issues, missing requirements and enhancement requests. Repeated evidence can affect future scope; individual preference does not automatically change the roadmap.
