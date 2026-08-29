# Autonomous Execution System

## Purpose

This repository is designed for autonomous implementation by a coding agent. The human owner should not need to manually orchestrate normal task-to-task progress.

## Execution hierarchy

```text
Master Roadmap
  -> Phase
      -> Task
          -> Implementation
          -> Validation
          -> Evidence
          -> Task completion
      -> Phase Gate
  -> Next Phase
```

## Required behavior

1. Read the source-of-truth hierarchy before changing code.
2. Read the current execution state.
3. Select the first unblocked task in the current phase.
4. Read that task file completely.
5. Load only the relevant project skills.
6. Inspect the existing implementation before editing.
7. Implement the task completely; do not stop after scaffolding.
8. Run focused tests, typecheck/lint/build as applicable.
9. Perform the task-specific acceptance checks.
10. Record evidence, files changed, validation results and status in the task file and execution state.
11. Mark the task `DONE` only when its Definition of Done is satisfied.
12. Immediately continue to the next unblocked task.
13. When every task in a phase is done, run the phase gate.
14. Advance to the next phase only when the phase gate passes.
15. Never silently skip a task, weaken an acceptance criterion, or mark work done without evidence.

## Autonomous continuation

Do not ask the user for confirmation between normal tasks or phases. Continue autonomously.

Stop and mark `BLOCKED — HUMAN DECISION REQUIRED` only when:

- an unresolved product/business/regulatory/legal decision is required;
- an architecture change conflicts with a frozen ADR;
- a required external account/credential cannot be safely provisioned by the agent;
- a destructive irreversible production action is required;
- or the task cannot be completed without violating a security or data-integrity rule.

When blocked, document the exact decision, evidence, options and recommended choice in the task file and execution state. Do not invent the decision.

## Error handling

If a test or validation fails:

```text
FAIL
 -> diagnose
 -> fix
 -> rerun focused validation
 -> rerun affected regression suite
 -> continue
```

If the same root cause remains after reasonable investigation, mark the task `BLOCKED — ENGINEERING` with reproduction steps and do not claim completion.

Do not bypass tests, remove assertions, weaken types, disable security checks, or hide warnings solely to obtain a green build.

## Checkpoints

After each completed task:

- update the task file;
- update `agent/EXECUTION_STATE.md`;
- update relevant docs/ADRs when behavior changes;
- keep the working tree coherent and buildable;
- create a focused commit when repository workflow permits.

A checkpoint is not the end of the run. Continue automatically.

## Phase gates

Every phase has a gate. A gate must verify:

- implementation scope;
- database/migrations;
- authorization/tenant isolation;
- domain invariants;
- tests;
- type/lint/build;
- critical error paths;
- documentation;
- security regressions;
- task evidence.

Only a passed gate permits phase advancement.

## Future-proof rule

Future-phase functionality may be represented by interfaces, adapters, contracts or tests when required by the architecture, but must not be implemented as unapproved feature scope.

## Reference repositories

Audited repositories under `references/` are research only. Read them when a task explicitly maps to them. Do not install or copy a reference repository wholesale.

## Skills

Skills under `/.agents/skills/` are specialized instructions. Use the task's skill hints plus relevant domain/security/testing skills. Do not load every skill for every task.
