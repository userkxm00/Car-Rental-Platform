---
name: api-contracts
description: Design and maintain the versioned REST API and frontend/mobile contracts for the Car Rental Platform. Use when adding endpoints, request/response schemas, DTOs, OpenAPI, pagination, errors, idempotency, webhooks, or generated clients.
---

# API Contracts Skill

## Contract-first

Read the relevant domain specification before adding an endpoint. Define request/response semantics before implementation. Keep `/api/v1` versioned and backward-compatible within a release unless an explicit breaking change is approved.

## Rules

- Validate external input at the boundary.
- Define typed request/response contracts.
- Use stable business error codes and consistent HTTP semantics.
- Never expose internal database structures as an accidental public API.
- Derive tenant scope server-side.
- Never trust client totals, roles, tenant IDs, ownership or status transitions.
- Use cursor pagination for large collections where appropriate.
- Use idempotency keys for retry-sensitive create/payment/webhook operations.
- Document authentication requirements and permissions for protected endpoints.
- Keep provider-specific payloads inside adapters.

## OpenAPI

Update the OpenAPI contract whenever endpoint behavior changes. Prefer generated typed clients/schemas for Web/Mobile where practical so contract drift is caught early.

## Error handling

Expose safe, actionable errors. Do not leak stack traces, SQL errors, secrets, internal identifiers, or security-sensitive existence information.

## Compatibility

A contract change must identify affected Web, Mobile, background jobs, tests and documentation before merge.

## References

Use `architecture/api-contracts-and-errors.md` and `docs/37-permission-matrix.md` as repository authority.
