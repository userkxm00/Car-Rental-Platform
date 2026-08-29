# Agent Execution Hub

This directory is the autonomous implementation control plane for Car Rental Platform.

## Start here

1. `MASTER_AUTONOMOUS_PROMPT.md` — one-time prompt for Replit Agent.
2. `AUTONOMOUS_EXECUTION.md` — execution protocol.
3. `EXECUTION_STATE.md` — persistent pointer/resume state.
4. `TASK_REGISTRY.md` — 19 phases / 95 ordered tasks.
5. `PHASE_TASK_SPECIFICATIONS.md` — task intent and gates.
6. `EVIDENCE_LOG.md` — executable evidence history.
7. `phases/PHASE-01.md` — detailed first implementation phase.

## How the agent progresses

```text
State -> Task -> Skills -> Inspect -> Implement -> Test -> Review -> Evidence
      -> DONE -> Next Task -> Phase Gate -> Next Phase
```

## Human interaction policy

Normal progress does not require human intervention. The agent should only stop for a documented human decision, an unresolvable engineering blocker, missing external credentials/accounts, or an irreversible destructive action.

## Task records

Each task has a stable ID in `TASK_REGISTRY.md`. During execution, the agent records task-specific evidence and status. This creates a durable audit trail without requiring the human to manually coordinate every task.

## Phase structure

Current plan contains:

- Phase 00 — frozen architecture foundation
- Phases 01–13 — Release 1 implementation and pilot capability
- Phase 14 — Customer Mobile, Release 2+
- Phases 15–19 — automation, partners, analytics/AI, hardening and production readiness

The phase definitions in `agent/development-phases.md` remain the master roadmap. The registry/task specifications turn that roadmap into executable work.
