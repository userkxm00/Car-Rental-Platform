---
name: security-review
description: Perform security reviews and secure-by-default implementation for this multi-tenant rental platform. Use for authentication, authorization, tenant isolation, API endpoints, file uploads, payments, webhooks, secrets, user-generated content, SSRF/XSS/CSRF, rate limits, and security-sensitive business workflows.
---

# Security Review Skill

## Review order

1. Identify trust boundaries and attacker-controlled input.
2. Verify authentication.
3. Verify authorization and tenant scope.
4. Check business-logic abuse paths.
5. Check injection/output/file handling.
6. Check secrets and cryptography.
7. Check replay/idempotency/webhook verification.
8. Check logging/monitoring without leaking sensitive data.
9. Add a regression test for every confirmed vulnerability or critical invariant.

## Car Rental threats

Always consider:
- cross-tenant access / BOLA;
- forged booking status or totals;
- double booking and race conditions;
- payment/webhook replay;
- QR token reuse or disclosure;
- private document/photo exposure;
- malicious review/comment content;
- abusive public search/API traffic;
- license/entitlement tampering;
- unsafe file uploads;
- live location leakage.

## Rules

- Never trust client-provided tenant IDs, permissions, prices, statuses, or payment results.
- Enforce authorization close to the protected operation.
- Treat platform-admin privileges as a separate trust boundary.
- Use short-lived/revocable operational tokens where QR flows require them.
- Keep provider secrets server-side.
- Do not expose private object-storage URLs without controlled authorization.
- Use allowlists/validation for URLs and external fetches to reduce SSRF risk.
- Sanitize/encode user-generated content according to its rendering context.
- Do not weaken security to make a test or feature pass.

## Reporting

Report only evidence-backed findings. Prioritize exploitable, high-confidence issues. Include impact, affected boundary, minimal reproduction, and the safest remediation.

## External reference

Adapted from security-review practices in Sentry's public Agent Skills and OpenAI's security-best-practices skill.
Sources:
- https://github.com/getsentry/skills/tree/main/skills/security-review
- https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices
