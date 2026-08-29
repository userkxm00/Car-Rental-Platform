---
name: frontend-code-review
description: Review React/TypeScript frontend code for correctness, maintainability, performance, accessibility, state handling, and consistency with project architecture and design system. Use for frontend PRs and targeted UI code audits.
---

# Frontend Code Review

Review in this order:
1. Correctness and user-visible behavior.
2. Security boundaries and protected data handling.
3. State/data flow and async race conditions.
4. Type safety and unnecessary `any`.
5. Component boundaries and reuse.
6. Accessibility.
7. Performance and unnecessary renders/network requests.
8. Responsive and RTL behavior.
9. Design-system consistency.
10. Test coverage.

Flag:
- duplicated domain logic in UI
- client-authoritative prices/permissions/status
- hidden loading/error states
- unsafe optimistic updates for critical operations
- excessive prop drilling or giant components
- unnecessary dependencies
- brittle selectors in tests
- missing empty states

Review against the repository's accepted architecture rather than personal framework preference.
