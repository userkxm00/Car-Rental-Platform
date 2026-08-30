# Task Record — 01-B Supabase Identity Boundary

Canonical parent: `agent/IMPLEMENTATION-WBS-V2.md` → PHASE 01 → Workstream 01-B [R1].
Legacy traceability: PHASE-01 / TASK-01-02 / TASK-01-03 (identity boundary portion).

## Objective & value

Put Supabase Auth behind a provider-neutral authentication boundary so the rental
domain never sees provider SDK types or provider identifiers. The boundary:
verifies tokens server-side, maps provider subjects to application identities,
provisions unknown subjects from verified claims only, and documents which auth
capabilities (password/verification/recovery/MFA) live in the provider versus the
platform. A future provider swap must not touch domain code.

## Preconditions

- 01-A Runtime Foundation COMPLETE (config, /api/v1, errors, logging, tests).
- Source of truth: `architecture/authentication-authorization.md`,
  `docs/36-authentication-and-authorization-architecture.md`,
  `architecture/adr/ADR-002-auth-provider-abstraction.md`,
  `docs/provider-and-environment-contract.md`.

## Affected domain modules

- `apps/api/src/auth/` (new boundary module). No rental-domain changes.

## Data/schema impact

- None yet: the DB-backed identity mapper lands in 01-C (users migration); 01-B
  defines its port and contract with a test-safe in-memory implementation.
  Dependency handoff documented in 01-C03.

## Security/tenant impact

- Provider metadata is never authorization. Only signature-verified claims feed
  identity mapping. No secrets in logs/errors. Bearer extraction is fail-closed.

## Atomic implementation units (execution order)

1. `01-B01` Auth provider adapter interface
   - `AuthProvider` port, `VerifiedPrincipal`, capability flags, auth error
     taxonomy (UNAUTHORIZED / TOKEN_INVALID / TOKEN_EXPIRED). Unit tests for the
     error mapping.
2. `01-B02` Supabase token verification boundary
   - `SupabaseAuthProvider` (JWKS/RS256 via `jose` remote JWK set, issuer +
     audience checks, `aal` surfaced, no metadata → authorization), `AuthGuard`
     (Bearer extraction, principal attach, `@Public()` escape hatch), param
     decorator. Env: `SUPABASE_JWKS_URL` override added to schema.
3. `01-B03` External identity → application user mapping
   - `IdentityMapper` port + `InMemoryIdentityMapper` test implementation;
     contract tests (unknown subject, known subject, invalid subject shape).
     DB implementation is 01-C03.
4. `01-B04` Unknown authenticated identity provisioning
   - `ProvisioningPolicy` port (provision from verified claims only: subject,
     email, emailVerified, locale default); default policy implementation;
     unit tests (never provisions from unverified/absent email, idempotent).
5. `01-B05` Disabled/deleted provider identity handling
   - Boundary decisions + tests: verification failures (expired/invalid/revoked)
     reject with 401; deleted provider identity detected by verification failure
     on next presentation; application-level user status gates authorization in
     01-C (documented handoff).
6. `01-B06…01-B09` Flow capability boundaries
   - `architecture/auth-flow-contracts.md`: email/password, email verification,
     password recovery and MFA capability boundaries — which side (Supabase
     Auth client SDKs) executes each flow, what the backend trusts (only the
     verified JWT + `aal`), recovery/verification never accept client claims.
   - `AuthCapabilities` flags drive capability reporting; no backend password
     handling is implemented (correct per frozen architecture).
7. `01-B10` Auth integration tests
   - Local JWKS server (jose-generated keypair) — e2e: valid token → 200 with
     principal; missing token → 401 UNAUTHORIZED; bad signature → 401
     TOKEN_INVALID; expired → 401 TOKEN_EXPIRED; wrong issuer/audience → 401;
     JWKS outage → 503 provider-unavailable (controlled); guard + @Public()
     behavior; requestId present on auth errors.

## Acceptance criteria (workstream)

- Domain code has zero Supabase SDK/type imports outside `auth/infrastructure/`.
- Every protected-route decision is based on signature-verified tokens.
- Provider failures are controlled (401/503, never 500 leaks).
- Flow capability boundaries are documented and match the frozen architecture.

## Evidence requirements

- unit + integration test outputs;
- e2e curl/supertest evidence for the guard matrix;
- EVIDENCE_LOG checkpoints per task.

## Rollback/recovery

- Additive module; rollback = revert. No schema changes.
