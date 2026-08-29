---
name: plan-execution
description: Execute an approved implementation plan in small, reviewable steps for the Car Rental Platform. Use when a phase/task has a written plan and implementation is beginning, continuing, or being reviewed.
---

# Plan Execution Skill

## Before coding

- Load `replit.md` and `AGENTS.md`.
- Load the phase specification and all affected architecture/domain documents.
- Check the applicable skill(s).
- Inspect the current repository state; do not assume scaffolding or schema exists.
- Identify dependencies, migrations, API changes, permissions, tests and rollback concerns.

## During implementation

- Work in small coherent increments.
- Preserve accepted architecture decisions.
- Prefer a focused change over a broad rewrite.
- Keep database migrations and code changes consistent.
- Do not introduce speculative features from later releases.

## After each increment

- Run focused tests and validation.
- Check types/lint/build as applicable.
- Review security/tenant impact.
- Update docs if behavior or decisions changed.
- Report blockers rather than silently inventing requirements.

## Completion

Do not declare a phase complete until its documented acceptance criteria and quality gates are satisfied.

## External reference

The workflow is informed by the public `obra/superpowers` executing-plans skill: load and critically review a written plan, execute with checkpoints, and surface concerns rather than silently changing scope.
Source: https://github.com/obra/superpowers/tree/main/skills/executing-plans
