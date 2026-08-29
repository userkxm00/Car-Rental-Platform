---
name: integration-connector-architecture
description: Use when adding external provider integrations such as payments, maps, notifications, storage, CRM, accounting, WhatsApp, analytics, or future AI tools.
---

# Integration Connector Architecture

Keep external providers behind explicit adapters/interfaces. Domain logic must depend on capabilities, not vendor SDKs.

## Rules
- Define provider-neutral request/response contracts first.
- Keep credentials and OAuth tokens outside domain entities where possible; protect and redact them.
- Record provider, external ID, request correlation ID and relevant status for reconciliation.
- Make webhook processing authenticated, idempotent and replay-safe.
- Treat provider outages and timeouts as expected failure modes.
- Do not let a provider-specific response become the authoritative booking/payment truth without validation.
- Add contract tests and provider-mocked integration tests.
- Keep provider replacement possible without rewriting booking, payment, notification or map domains.

## Car Rental applications
Examples include:
- Chargily/future payment gateways
- BaridiMob/manual payment evidence
- map/geocoding providers
- email/SMS/WhatsApp providers
- object storage/CDN
- analytics/ads
- future telematics/GPS

## OpenConnector lesson
`oomol-lab/open-connector` demonstrates a useful separation between credentials, provider catalogs, action schemas, policies, tokens and execution logs. We may borrow the separation principle for future platform integrations; we do not need to embed the connector project itself into Release 1.

Source: https://github.com/oomol-lab/open-connector (Apache-2.0)
