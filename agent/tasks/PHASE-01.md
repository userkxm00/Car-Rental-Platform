# PHASE-01 — Identity & Access

## 01-01 Foundation/runtime/config contract
**Depends:** Phase 00. **Skills:** nestjs-production, postgres-production, api-contracts, agent-skill-security.
**Ready:** architecture freeze is active; no existing runtime contract is violated.
**Acceptance:** monorepo/runtime configuration, environment validation, secrets boundary and initial API bootstrap are coherent and tested.

## 01-02 User identity model/persistence
**Depends:** 01-01. **Skills:** nestjs-production, postgres-production, car-rental-domain.
**Acceptance:** application user identity is separate from memberships/provider identities; lifecycle and uniqueness are migration-tested.

## 01-03 Sessions/tokens/verification/recovery
**Depends:** 01-02. **Skills:** nestjs-production, api-contracts, testing-quality, agent-skill-security.
**Acceptance:** login/logout/revocation, verification and recovery are secure, rate-limited and tested; no plaintext secrets.

## 01-04 RBAC/authorization/scopes
**Depends:** 01-03. **Skills:** nestjs-production, api-contracts, postgres-production, car-rental-domain.
**Acceptance:** permission catalog, platform/agency scopes and server-side guards enforce least privilege; no client role/tenant spoofing.

## 01-05 Phase gate
**Depends:** 01-04. **Gate:** unauthorized access is denied, role matrix works, privileged events are audited, tests/typecheck/lint/build pass, evidence is recorded.
