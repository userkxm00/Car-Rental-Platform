# Algeria & Maghreb Product Requirements

## Scope

Initial design target: Algeria, then Morocco and Tunisia, with an architecture suitable for wider MENA/North Africa.

## Localization

Required from day one:
- Arabic.
- French.
- English.
- Arabic RTL layouts across web and mobile.
- Locale-aware dates, numbers, currencies and pluralization.
- Localized system emails/push/in-app messages.
- Localized contracts and receipts.

Do not implement translation by scattering hard-coded strings through UI components. Use a centralized translation catalog with stable message keys and translation completeness checks.

## Algeria payments

Online payment architecture must be provider-neutral. SATIM states that WebMarchand integration requires a merchant application, technical integration tests and certification/authorization before exploitation. Therefore the platform must not assume that every Algerian agency can activate online card payments immediately.

Source: https://satim.dz/index.php/fr/e-paiement/integration-webmarchand

Recommended initial payment modes:
- Cash at counter.
- Bank transfer/manual reconciliation.
- Online payment through an enabled provider adapter.
- Deposit/partial-payment workflows.

The core payment domain should support future CIB/local-provider integration without changing booking or accounting logic.

## Regional operational scenarios

Support as configuration/data, not hard-coded country exceptions:

- Airport pickup/return.
- Hotel delivery/pickup.
- City-to-city one-way rental.
- Branch-to-branch transfer.
- Cash/transfer/manual payment proof.
- Deposit and balance collection.
- Customer document verification.
- Local working-hours and holiday rules.
- Vehicle delivery zones.
- Agency-specific cancellation policies.

## Phone-first operations

Many bookings may begin via phone, messaging or walk-in rather than a web funnel. Staff must be able to create a booking manually using the same booking engine as online customers.

The customer record should support phone-first lookup and consent/preferences while avoiding duplicate profiles.

## Connectivity resilience

Mobile staff workflows should degrade gracefully when connectivity is intermittent, especially for pickup/return operations.

Design principle:
- Cache the minimum operational context needed for a current assigned task.
- Queue safe, non-conflicting actions for synchronization when appropriate.
- Do not allow offline actions to bypass authoritative conflict/financial checks.
- Clearly show sync state and conflicts.

## Privacy

Do not collect or retain identity documents beyond legitimate operational requirements and configured retention policies. Access to documents must be permission-scoped and auditable.

## Country expansion model

Keep country-specific configuration separate from domain code:
- Currency.
- Locale.
- Tax/fee configuration.
- Supported payment providers.
- Documents/eligibility fields.
- Contract templates.
- Phone number formatting.
- Business hours/holidays.

This allows Algeria/Morocco/Tunisia support without forking the platform.
