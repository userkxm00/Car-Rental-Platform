# Phase 01 — Identity & Access

This file is the phase overview only. The canonical executable task specification is:

`agent/tasks/PHASE-01.md`

## Goal

Establish secure identity, sessions, roles, permissions and privileged-action auditing.

## Task sequence

01-01 → 01-02 → 01-03 → 01-04 → 01-05 (gate)

## Gate

Unauthorized access must be rejected; the role/permission matrix must be enforced server-side; tenant/platform scope must not be bypassable; sensitive actions must be audited; required tests/typecheck/lint/build must pass.

## Required references

- `architecture/architecture-freeze-decision.md`
- `architecture/security-threat-model.md`
- `docs/36-authentication-and-authorization-architecture.md`
- `docs/37-permission-matrix.md`
- `agent/tasks/PHASE-01.md`
