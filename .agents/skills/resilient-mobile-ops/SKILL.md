---
name: resilient-mobile-ops
description: Design mobile operational workflows that remain safe under weak connectivity, intermittent network failures, retries, and temporary offline conditions. Use for agency pickup/return, inspection, QR, photo capture, notifications, and sync.
---

# Resilient Mobile Operations

Offline support must never compromise booking, money, authorization, or audit integrity.

## Principles
- Clearly distinguish server-confirmed state from locally captured state.
- Queue only operations that are explicitly safe to retry.
- Give every retry-sensitive mutation an idempotency strategy.
- Show sync status and last server confirmation to staff.
- Never silently invent a successful server outcome while offline.
- Preserve captured inspection/photos locally until securely uploaded and acknowledged.
- Handle duplicate taps, app restarts, expired sessions, and network timeouts.

## Release 1 workflows
Prioritize safe degraded operation for:
- QR lookup
- pickup checklist
- return checklist
- mileage/fuel capture
- photo evidence capture
- task notes

Critical server decisions such as availability confirmation, payment authorization, entitlement changes, and final settlement remain server authoritative.
