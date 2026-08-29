# ADR-001 — Start as a Modular Monolith

Status: Accepted

## Decision

Release 1 uses a modular monolith backend organized by business domains.

## Rationale

- Lower operational complexity.
- Faster development and deployment.
- Shared transactions for booking/payment workflows.
- Easier local development with Replit.
- Clear domain boundaries preserve a future extraction path if scale requires it.

## Consequences

Modules must have explicit ownership and interfaces. They must not reach into other modules' persistence internals without an approved application/domain contract.

Microservices are introduced only after measured operational or scaling needs justify the additional complexity.
