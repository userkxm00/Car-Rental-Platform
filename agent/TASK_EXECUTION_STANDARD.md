# Autonomous Task Execution Standard

This is the canonical execution standard for every implementation unit in KAVRIQO.

## Hierarchy

`Release → Phase → Workstream → WBS Task → Atomic Unit → Verification → Evidence → Gate`

The high-level 19-phase / 95-task registry is a compatibility index. `agent/IMPLEMENTATION-WBS-V2.md` is the canonical granular plan.

## Task lifecycle

`READY → IN_PROGRESS → VALIDATING → DONE`

Blocked states:
- `BLOCKED — ENGINEERING`
- `BLOCKED — HUMAN DECISION REQUIRED`

## Definition of Ready

A WBS task can start only when:
- its phase is active;
- declared dependencies are DONE;
- the task exists in the WBS;
- relevant requirements/acceptance criteria can be identified;
- relevant skills are available;
- required architecture/provider decisions are known.

Before coding, the agent MUST decompose any broad WBS task into atomic implementation units when the task contains multiple independent acceptance outcomes, user journeys, modules, migrations, or provider integrations.

## Atomic unit requirements

An atomic implementation unit should have:
- one coherent concern;
- bounded files/modules;
- one primary outcome;
- explicit dependencies;
- deterministic verification;
- no unrelated refactor.

Use `agent/ATOMIC-TASK-DECOMPOSITION-STANDARD.md`.

The goal is safe, reviewable work — not a fixed count of subtasks.

## Required task record

The active task record/evidence must capture:
- ID/title;
- purpose/user value;
- dependencies;
- affected domains;
- required skills;
- source-of-truth documents;
- implementation constraints;
- atomic implementation units when needed;
- acceptance criteria;
- validation checks;
- security/tenant/financial/concurrency checks where relevant;
- evidence;
- status/timestamps;
- commit/checkpoint;
- remaining risks.

## Execution rule

The agent must finish the current atomic unit, repair normal failures, validate it, record evidence, and continue.

Do not mark a parent WBS task DONE while required atomic units remain incomplete.

## Retry rule

Do not loop forever. Preserve failure evidence and use `BLOCKED — ENGINEERING` only after reasonable diagnosis of a genuine unresolved technical root cause.

## Human-decision rule

Use `BLOCKED — HUMAN DECISION REQUIRED` only for a genuinely unresolved product/legal/regulatory/material-architecture/irreversible decision, or a mandatory external capability with no safe boundary.

A cancelled/stopped/expired IDE task is never a human blocker by itself.

## Phase completion

A phase passes only when all Release-scoped WBS work for that phase is DONE and the phase gate passes.

The phase gate must validate implementation scope, business rules, database/migrations, authorization/tenant isolation, domain invariants, tests, type/lint/build, critical runtime behavior, documentation, and security. Add UI/mobile/performance/recovery checks when relevant.

## Evidence standard

Evidence must be executable or externally observable where practical:
- test output;
- typecheck/lint/build results;
- migration verification;
- API proof;
- browser/mobile proof;
- security/authorization results;
- concurrency/idempotency results;
- performance/recovery evidence.

Claims such as "implemented" or "looks good" are not evidence.

## State

`agent/EXECUTION_STATE.md` is the persistent resume pointer. Update it after every meaningful completed unit and every gate.
