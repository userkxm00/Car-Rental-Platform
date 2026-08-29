---
name: external-reference-registry
description: Govern use of external GitHub repositories as research references. Use when an agent considers copying patterns, adding a dependency, importing a skill, or consulting a reference repository.
---

# External Reference Registry

External repositories are research inputs, not the product source of truth.

## Required process
1. Identify exactly what pattern is useful.
2. Check repository license and whether the intended use is compatible.
3. Prefer adapting the idea into local project-specific code or a concise local skill.
4. Do not clone/install a full external repository as an application dependency unless an ADR explicitly approves it.
5. Never copy branding, proprietary-looking assets, credentials, unrelated business logic, or large code blocks merely for convenience.
6. Record the source and the adopted pattern in `references/` when materially useful.
7. If the source conflicts with project ADRs or business rules, the project documentation wins.

## Installed Skills vs References
- Skills: concise instructions for the coding agent; stored under `.agents/skills/`.
- References: audited repositories and notes; stored under `references/`.
- Dependencies: runtime packages needed by the product; require compatibility/security review.

## Current references
Important references include Frappe/ERPNext/Frappe UI, POS Global, audited car-rental repositories, Taste-Skill, UI/UX Pro Max, OpenConnector, and other sources recorded in `docs/45-agent-skills-registry.md`.

## Agent behavior
Before adding any repository-derived package or copied skill, stop and use the relevant audit record. If no audit exists, create or request one rather than silently importing it.
