# Autonomous Execution Recovery

## Purpose

Ensure temporary Replit/IDE task state can never accidentally stop the repository's autonomous execution plan.

## Source of truth

Canonical execution state is determined only by:

1. `agent/EXECUTION_STATE.md`
2. `agent/TASK_REGISTRY.md`
3. active `agent/tasks/PHASE-NN.md`
4. accepted architecture/product/security documents

IDE task cards, temporary agent summaries, cancelled tasks, session-local plans, generated UI summaries, and transient tool state are not authoritative.

## Cancelled/stopped task recovery

If Replit reports that a task is:

- cancelled
- stopped
- expired
- archived
- unavailable
- superseded by a temporary task

continue autonomous execution unless the canonical repository state explicitly marks the work as blocked or superseded.

Recovery procedure:

```text
IDE task interruption
        ↓
Inspect git status/diff
        ↓
Read EXECUTION_STATE
        ↓
Read TASK_REGISTRY
        ↓
Read active phase/task spec
        ↓
Determine actual implementation progress
        ↓
Preserve valid work
        ↓
Repair/reconcile stale metadata
        ↓
Resume canonical task
        ↓
Validate
        ↓
DONE
        ↓
Next task
```

Never throw away valid partial work merely because an IDE task was cancelled.

## When to stop

Only stop when the repository state reaches:

`BLOCKED — HUMAN DECISION REQUIRED`

or a true `BLOCKED — ENGINEERING` condition that cannot be safely resolved after reasonable diagnosis.

A cancelled IDE task is not a blocker by itself.

## Autonomous continuity rule

After recovery, the agent must return to the normal execution loop:

```text
Task
→ Validate
→ Evidence
→ DONE
→ Next Task
→ Phase Gate
→ Next Phase
```

Do not return control to the human merely because a temporary IDE task ended.

## Stale metadata rule

If task descriptions, IDE summaries, or generated notes contradict canonical repository state:

- prefer canonical repository state;
- reconcile the stale metadata when possible;
- document material discrepancies;
- do not invent a new roadmap.

## Partial implementation rule

If a cancelled task left changes behind:

1. inspect the diff;
2. test the current state;
3. keep correct work;
4. complete missing acceptance criteria;
5. do not duplicate existing implementation;
6. record evidence only after the task genuinely passes.
