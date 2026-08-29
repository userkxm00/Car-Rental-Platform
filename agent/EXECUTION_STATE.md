# Autonomous Execution State

This file is the persistent checkpoint for autonomous implementation.

## Status

- Overall: `READY_TO_START`
- Current phase: `PHASE-01`
- Current task: `TASK-01-01`
- Last completed task: none
- Last completed phase: `PHASE-00`
- Current attempt: `0`
- Last validation: `repository documentation audit`
- Last known good commit: `062d2f6f9f2b09f643c36e6a601da0236037690f`
- Blocker: none
- Next action: execute TASK-01-01
- Last updated: 2026-08-29

## State transition rules

- `READY_TO_START` → `IN_PROGRESS` when work begins.
- `IN_PROGRESS` → `VALIDATING` after implementation.
- `VALIDATING` → `DONE` only when acceptance criteria and required evidence pass.
- A failed normal validation returns to `IN_PROGRESS` for repair.
- Repeated unresolved technical failure becomes `BLOCKED — ENGINEERING` with reproduction evidence.
- An unresolved product/legal/security/irreversible decision becomes `BLOCKED — HUMAN DECISION REQUIRED`.
- Never move to the next task unless the current task is `DONE`.
- Never move to the next phase unless all phase tasks are `DONE` and its gate is `PASSED`.

## Current execution pointer

Canonical phase/task specifications live under `agent/tasks/PHASE-NN.md`. `agent/TASK_REGISTRY.md` is the ordered index. Do not invent a different sequence.

## Required checkpoint data after every task

Record:
- task status
- start/completion time
- attempt number
- files changed
- validation commands/results
- security/tenant checks
- migration/API/UI evidence when relevant
- commit SHA if committed
- next task

## Resume rule

A new agent/session must read this file first and resume from the current pointer. Never restart a completed task unless regression evidence requires it.

## Phase 00

Architecture baseline is frozen for Release 1. Provider selections that are implementation-specific are resolved behind approved abstractions in the relevant phase/task; they are not permission to change the frozen architecture.
