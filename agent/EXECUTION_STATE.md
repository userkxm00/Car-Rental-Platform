# Autonomous Execution State

This file is the persistent checkpoint for autonomous implementation.

## Status

- Overall: `READY_TO_START`
- Current phase: `PHASE-01`
- Current task: `TASK-01-01`
- Last completed task: none
- Last completed phase: `PHASE-00`
- Blocker: none

## Rules

- Update this file after every task and phase gate.
- Status values: `READY`, `IN_PROGRESS`, `DONE`, `BLOCKED — HUMAN DECISION REQUIRED`, `BLOCKED — ENGINEERING`.
- Never move to the next task unless the current task is `DONE`.
- Never move to the next phase unless its gate is `PASSED`.

## Current execution pointer

See `agent/tasks/` for task definitions. Execute tasks in numeric order unless a task declares an explicit dependency.

## Evidence pointer

Completed-task evidence is recorded in each task file and summarized in `agent/EVIDENCE_LOG.md`.

## Last checkpoint

No implementation task has started yet.
