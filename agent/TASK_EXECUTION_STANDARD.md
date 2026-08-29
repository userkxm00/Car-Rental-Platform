# Autonomous Task Execution Standard

This is the canonical execution standard for every task in the project.

## Task lifecycle

`READY → IN_PROGRESS → VALIDATING → DONE`

Blocked states:
- `BLOCKED — ENGINEERING`
- `BLOCKED — HUMAN DECISION REQUIRED`

## Definition of Ready

A task can start only when:
- its phase is active;
- all declared dependencies are DONE;
- the task specification exists;
- acceptance criteria are explicit;
- required skills are identified;
- any provider/ADR decision required for this task is available.

## Required task record

Every task file must contain:
- ID and title;
- phase;
- purpose/user value;
- dependencies;
- affected domains;
- required skills;
- relevant source-of-truth documents;
- implementation notes/constraints;
- acceptance criteria;
- validation commands/checks;
- security/tenant/financial checks where relevant;
- evidence section;
- status and timestamps;
- last commit/reference where available;
- remaining risks.

## Execution rule

The agent must finish the task, repair normal failures, validate it, record evidence, and only then move to the next task.

## Retry rule

Do not loop forever. After repeated failures with the same root cause, preserve the failure evidence and mark `BLOCKED — ENGINEERING` with reproduction and next-action notes.

## Phase completion

A phase passes only when all five tasks are DONE and the phase gate passes. The agent then updates the persistent state and advances automatically.

## Evidence standard

Evidence must be executable or externally observable. Examples:
- test output;
- typecheck/lint/build result;
- migration verification;
- API request/response proof;
- browser/runtime proof;
- screenshots for UI when useful;
- security/authorization regression result.

Claims such as "implemented" or "looks good" are not evidence.

## State recovery fields

`EXECUTION_STATE.md` must preserve:
- overall status;
- active phase/task;
- last completed task/phase;
- current attempt;
- last validation;
- last known good commit;
- blocker;
- next action;
- updated timestamp.
