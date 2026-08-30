# Auth Flow Contracts — Phase 01

**Status:** ACTIVE (implemented baseline: `apps/api/src/auth`, commit `e74a001`)
**Sources:** `architecture/authentication-authorization.md`, `docs/36-authentication-and-authorization-architecture.md`, `ADR-002-auth-provider-abstraction.md`, `docs/provider-and-environment-contract.md`

This document pins the capability boundaries between Supabase Auth (the Release 1
identity provider) and the KAVRIQO backend. Rules marked **INVARIANT** must not be
changed without the repository ADR process.

## 1. Provider-neutral boundary (INVARIANT)

- The backend trusts exactly one artifact from the provider: a
  signature-verified access token (JWKS/RS256, issuer + audience checked).
- Provider identifiers (Supabase user UUIDs) live only in the auth boundary;
  domain entities reference application user IDs.
- Provider metadata (`role`, `app_metadata`, `user_metadata`) is **never**
  authorization. Roles/permissions come exclusively from the application
  database (01-D).

## 2. Sign-in (email + password)

- **Client side (Supabase client SDK):** credential collection, provider
  session creation, token storage/refresh. The backend never receives
  passwords.
- **Backend:** verifies the presented access token per request. It does not
  validate passwords, does not issue tokens, and does not store provider
  sessions.
- **Capability flag:** `capabilities.emailPassword = true` (Supabase).

## 3. Email verification

- **Client side:** Supabase verification email + confirmation step.
- **Backend:** trusts only the token claim `email_verified` after signature
  verification. It never marks emails verified from client-submitted state.
  Application-level trust in `emailVerified` is applied by identity mapping
  (01-C).

## 4. Password recovery

- **Client side:** Supabase reset flow (recovery email → token exchange).
- **Backend:** recovery produces a fresh valid access token on the next
  login; there is nothing recovery-specific for the backend to trust beyond
  that token. No backend "reset" endpoint exists or may be added without an
  ADR.

## 5. MFA

- **Client side:** Supabase MFA enrollment/challenge.
- **Backend:** observes the verified `aal` claim. `aal` is surfaced in the
  `VerifiedPrincipal` for future step-up policies (e.g. finance operations
  requiring `aal2`); Phase 01 does not gate routes on `aal` yet, but the
  claim is available without provider coupling.

## 6. Disabled/deleted identities (INVARIANT semantics)

- Provider-side disable/delete is observed passively: the next token
  verification fails → `401 TOKEN_INVALID/TOKEN_EXPIRED`. The backend never
  reconciles provider user state via Admin SDK polling.
- Application-side lifecycle (`SUSPENDED`/`DEACTIVATED` status in the
  application user table, 01-C) is authoritative for backend access:
  resolution fails with `403 USER_DISABLED`.
- Either signal denies access. Combined, they cover the full lifecycle
  without coupling the backend to provider webhooks (not available in
  Release 1 without an ADR).

## 7. Session lifecycle

- The provider session (`session_id` claim) is surfaced for revocation
  correlation only; the backend does not store provider sessions.

## 8. Provider outage behavior (INVARIANT)

- JWKS unreachable / provider errors degrade to `503 PROVIDER_UNAVAILABLE` —
  controlled unavailability, never a granted request and never a 500 stack
  leak. Requests with a provider outage are retried by clients against a
  consistent error code.

## 9. Token requirements

- `sub` required; `email` optional; `email_verified` optional boolean;
  `aal` ∈ {aal1, aal2, aal3}; `session_id`, `iat` optional.
- Issuer must equal `SUPABASE_JWT_ISSUER` (default `<SUPABASE_URL>/auth/v1`);
  audience must equal `SUPABASE_JWT_AUDIENCE` (default `authenticated`).
- JWKS endpoint: `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, overridable
  via `SUPABASE_JWKS_URL` (also used by the integration test suite).

## 10. Test provider

The suite spins a local JWKS server (jose-generated keypair) so integration
tests exercise the real verification path without external network access.
This is a test double for the provider, not production behavior.
