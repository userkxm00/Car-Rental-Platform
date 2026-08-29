# KAVRIQO — Task Registry

## Canonical status

The previous 19-phase / 95-task index remains as a **legacy traceability layer** only.

The canonical implementation breakdown is now:

`agent/IMPLEMENTATION-WBS-V2.md`

It defines:

```text
Phase → Workstream → Task → Optional Subtask → Verification → Evidence → Gate
```

The older `01-01` ... `19-05` IDs remain valid parent/legacy IDs and must not be deleted because documentation and traceability may reference them. However, an agent MUST NOT consider a legacy parent task complete while required WBS v2 child work remains incomplete.

## Execution order

1. Determine the active release.
2. Read `agent/EXECUTION_STATE.md`.
3. Open the active phase in `agent/IMPLEMENTATION-WBS-V2.md`.
4. Select the first unfinished eligible Workstream/Task.
5. Read the exact task specification plus linked architecture/docs/ADRs/skills.
6. Implement and verify the smallest coherent unit.
7. Record evidence and update state.
8. Continue to the next eligible task.
9. Run the phase gate only after all WBS-required work for the phase passes.

## Compatibility

`agent/tasks/PHASE-NN.md` remains useful as a concise phase acceptance summary. It is not a replacement for the granular WBS v2.

## No IDE authority

Replit/Cursor/Codex/Claude Code/Gemini or another IDE/agent task list is never the authoritative task source. Cancelled, stopped, expired or archived IDE tasks do not cancel repository work.

## Canonical execution files

- `agent/IMPLEMENTATION-WBS-V2.md` — granular implementation plan
- `agent/AGENT-AGNOSTIC-EXECUTION-PROTOCOL.md` — tool/agent-neutral execution rules
- `agent/EXECUTION_STATE.md` — persistent checkpoint
- `agent/EVIDENCE_LOG.md` — durable evidence
- `agent/tasks/PHASE-NN.md` — phase summaries and gates

## Legacy high-level index

The historical 19 phases / 95 IDs are preserved in the repository history and traceability system. New implementation work must follow the WBS v2 breakdown rather than treating one broad five-task-per-phase checklist as sufficient.