# Phase 01 — Identity & Access

Goal: establish secure identity, sessions, roles, permissions and privileged-action auditing.

Tasks:
- 01-01 Foundation/runtime/config contract.
- 01-02 User identity model and persistence.
- 01-03 Sessions/tokens, verification and recovery.
- 01-04 RBAC, agency/platform scopes and guards.
- 01-05 Gate: unauthorized access rejected; role matrix enforced server-side; sensitive actions audited; tests/typecheck/lint/build pass.

Required skills: nestjs-production, postgres-production, api-contracts, testing-quality, agent-skill-security.
Read: architecture/auth-model.md, architecture/security-threat-model.md, docs/36-authentication-and-authorization-architecture.md, docs/37-permission-matrix.md.
