# Autonomous Execution System

## Purpose

This repository is designed for autonomous implementation by a coding agent. The human owner should not need to manually orchestrate normal task-to-task or phase-to-phase progress.

## Execution hierarchy

```text
Master Roadmap
  -> Phase
      -> Task specification
          -> Ready check
          -> Load Skills
          -> Inspect
          -> Implement
          -> Validate
          -> Review
          -> Evidence
          -> DONE
      -> Phase Gate
  -> Next Phase
```

## Canonical execution files

- `agent/MASTER_AUTONOMOUS_PROMPT.md` — one-time agent instruction.
- `agent/EXECUTION_STATE.md` — persistent checkpoint/resume pointer.
- `agent/TASK_REGISTRY.md` — canonical ordered list of 19 phases / 95 tasks.
- `agent/tasks/PHASE-NN.md` — canonical five-task specification for each phase.
- `agent/EVIDENCE_LOG.md` — durable checkpoint evidence.
- `agent/TASK_EXECUTION_STANDARD.md` — task Ready/Done/evidence standard.
- `agent/EXECUTION_RECOVERY.md` — recovery rules for interrupted/cancelled IDE tasks and stale metadata.

## Required behavior

1. Read the source-of-truth hierarchy before changing code.
2. Read `EXECUTION_STATE.md`.
3. Select the first uncompleted task in the active phase.
4. Read `agent/tasks/PHASE-NN.md` and the exact task section completely.
5. Confirm Definition of Ready and dependencies.
6. Load only relevant project skills.
7. Inspect the existing implementation before editing.
8. Implement the task completely; do not stop at scaffolding.
9. Run focused tests and required typecheck/lint/build/migration/runtime checks.
10. Repair normal failures and rerun validation.
11. Perform task acceptance, security and tenant checks.
12. Record evidence and checkpoint state.
13. Mark the task `DONE` only when its Definition of Done is satisfied.
14. Immediately continue to the next eligible task.
15. Run the phase gate after all five tasks are DONE.
16. Advance only when the phase gate passes.
17. Continue autonomously.

## External IDE task state is NOT the source of truth

Replit/IDE task cards, generated task summaries, cancelled task labels, temporary planning artifacts, and session-local agent state must never override the repository execution system.

If an IDE task is marked `cancelled`, `stopped`, `expired`, `archived`, or otherwise unavailable, do NOT stop the repository execution unless the repository `EXECUTION_STATE.md` or a canonical task specification explicitly says the task is blocked or superseded.

Instead:

1. Read `EXECUTION_RECOVERY.md`.
2. Inspect the repository state/diff.
3. Determine the canonical task from `EXECUTION_STATE.md` + `TASK_REGISTRY.md`.
4. Reconcile stale metadata.
5. Resume the canonical task from the repository state.

A cancelled temporary task is not equivalent to `BLOCKED — HUMAN DECISION REQUIRED`.

## No routine confirmation

Do not ask the user for confirmation between normal tasks, tests, documentation updates or phase transitions.

## Human decision conditions

Stop only for:
- unresolved product/business/legal/regulatory ambiguity that cannot be safely inferred;
- material architecture change conflicting with a frozen ADR;
- missing external credentials/accounts required for the task and no safe local boundary exists;
- irreversible/destructive production action;
- security or data-integrity issue that cannot be safely resolved within the task.

When blocked, write exact reproduction/evidence, affected task, impact, possible options and recommended decision into the phase task record and execution state.

## Error handling

```text
FAIL
 -> diagnose root cause
 -> fix
 -> focused validation
 -> impacted regression suite
 -> continue when green
```

If the same technical root cause remains unresolved after reasonable investigation, mark `BLOCKED — ENGINEERING`. Never bypass tests or weaken requirements to obtain green status.

## Checkpoint protocol

After each completed task:
- update the relevant phase task section with status/evidence;
- update `agent/EXECUTION_STATE.md`;
- append `agent/EVIDENCE_LOG.md`;
- update docs/ADR if behavior or architecture changed;
- create a focused commit when appropriate.

A checkpoint is never permission to stop the autonomous run.

## Phase gate

Every phase gate must check implementation scope, business rules, database/migrations, authorization/tenant isolation, domain invariants, tests, type/lint/build, critical errors, documentation and security. Release-specific gates may add visual/mobile/performance/recovery checks.

## Future scope

Future capabilities may be represented by interfaces/adapters when required, but must not be implemented before their scheduled phase/release.

## Reference and skills policy

Audited references under `references/` are research only. Project Skills under `/.agents/skills/` are specialized instructions. Neither overrides the frozen architecture or product/business rules.
