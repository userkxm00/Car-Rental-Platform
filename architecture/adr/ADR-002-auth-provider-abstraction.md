# ADR-002 — Authentication Provider Abstraction

Status: Accepted

## Decision

Do not couple the domain model directly to a single authentication vendor during Phase 00.

The application exposes an internal identity/session boundary. The chosen authentication implementation must provide the capabilities required by:
- customer web;
- agency web;
- agency mobile;
- privileged platform admin;
- password recovery;
- optional phone/OTP;
- MFA for privileged users;
- session/device revocation.

## Why

The project may use a managed auth provider for operational efficiency, but the business domain must remain portable and must not scatter provider-specific user IDs or authorization rules throughout the application.

## Consequences

- External identity ID is stored as an integration reference.
- Internal `users` and tenant memberships remain domain-owned.
- Authentication events are mapped into the domain audit model.
- Provider-specific SDK usage remains inside an infrastructure adapter.

## Follow-up decision

Select the concrete provider after evaluating:
- mobile support;
- OTP/SMS options in Algeria and the Maghreb;
- MFA;
- session management;
- cost at target scale;
- export/migration options;
- operational reliability;
- integration with the selected hosting architecture.
