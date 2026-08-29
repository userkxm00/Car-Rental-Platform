# Agent Execution Hub

This directory is the autonomous implementation control plane for Car Rental Platform.

## Start here

1. `MASTER_AUTONOMOUS_PROMPT.md` — one-time prompt for Replit Agent.
2. `AUTONOMOUS_EXECUTION.md` — execution protocol.
3. `TASK_EXECUTION_STANDARD.md` — Ready/Done/evidence rules.
4. `EXECUTION_STATE.md` — persistent checkpoint/resume pointer.
5. `TASK_REGISTRY.md` — 19 phases / 95 ordered tasks.
6. `tasks/PHASE-NN.md` — canonical executable task specification for each phase.
7. `EVIDENCE_LOG.md` — executable evidence history.

## Execution model

```text
State
→ Ready Check
→ Phase Task Spec
→ Load Skills
→ Inspect
→ Implement
→ Test
→ Repair
→ Review
→ Evidence
→ DONE
→ Next Task
→ Phase Gate
→ Next Phase
```

The human owner does not need to coordinate normal task-to-task progress.

## Human interaction

Only genuine blockers require human input. Ordinary code errors, failed tests, missing small abstractions and normal implementation decisions must be resolved by the agent using repository source-of-truth.

## Phase structure

- Phase 00 — frozen architecture foundation.
- Phases 01–13 — Release 1 implementation and pilot capability.
- Phase 14 — Customer Mobile, Release 2+.
- Phases 15–19 — notifications/automation, partners/loyalty, analytics/AI, hardening and production readiness.

`agent/development-phases.md` is the roadmap summary. `agent/TASK_REGISTRY.md` is the canonical order. `agent/tasks/PHASE-NN.md` is the canonical task specification for the active phase.
