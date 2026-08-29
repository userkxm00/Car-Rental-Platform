# KAVRIQO — Agent-Agnostic Execution Protocol

## Purpose

KAVRIQO must be executable by any capable coding agent or IDE without changing the product plan:

- Replit Agent
- Codex / Codex CLI
- Claude Code
- Gemini CLI
- Cursor
- Windsurf
- Cline / Roo / Kilo / OpenCode
- an agent connected through an external AI router such as OmniRoute

The plan is repository-owned, not IDE-owned, model-owned, or router-owned.

## Canonical hierarchy

```text
Product / Business Truth
→ Architecture / ADRs
→ Release Scope
→ Implementation WBS v2
→ Phase
→ Workstream
→ WBS Task
→ Atomic Implementation Unit
→ Verification
→ Evidence
→ Gate
→ Next eligible work
```

## Important: 95 is not the implementation limit

The legacy 19-phase / 95-task registry exists for traceability. It is NOT the maximum number of implementation tasks.

`agent/IMPLEMENTATION-WBS-V2.md` is the granular plan. A WBS item that is still too large MUST be decomposed into atomic implementation units before or during execution.

See:

`agent/ATOMIC-TASK-DECOMPOSITION-STANDARD.md`

The agent must never compress multiple independent concerns into one checkbox merely to preserve the historical task count.

## Agent session / interruption

An agent session may be interrupted at any time. The next session must resume from repository state, not model memory and not an IDE queue.

Read:

- `agent/EXECUTION_STATE.md`
- `agent/IMPLEMENTATION-WBS-V2.md`
- active task specification/record
- `agent/EVIDENCE_LOG.md`
- accepted architecture/product/security documents

Temporary IDE states such as cancelled, stopped, expired, archived or interrupted do not override repository state.

## Work selection

Select work in this order:

1. active release;
2. current phase;
3. current workstream;
4. dependencies;
5. first unfinished WBS item;
6. atomic decomposition if the item is not sufficiently small.

Do not select work because it is easier, visually attractive, or present in an IDE queue.

## Atomic execution

Before editing a broad WBS item, determine whether it contains multiple independent concerns.

Split when it contains distinct:

- schema/migration work;
- domain logic;
- data access;
- API contract/validation;
- authorization/tenant scope;
- provider integration;
- background jobs/events;
- web UI;
- mobile UI;
- localization/accessibility;
- testing;
- observability;
- documentation.

Each atomic unit needs a clear outcome and deterministic verification.

## Autonomous progression

After an atomic unit passes verification:

```text
Unit DONE
→ evidence
→ state update
→ next unit
```

After the parent WBS item passes:

```text
WBS item DONE
→ state update
→ next WBS item
```

After a phase gate passes:

```text
Phase COMPLETE
→ evidence
→ state update
→ next phase
```

No routine human confirmation is required.

## Failure recovery

Normal coding failures must be repaired autonomously:

```text
FAIL
→ diagnose
→ fix
→ focused validation
→ regression validation
→ continue
```

A cancelled IDE task is never a blocker by itself.

## Human decision boundary

Stop only for a genuine unresolved:

- product/business policy;
- legal/regulatory interpretation;
- material architecture change;
- irreversible production action;
- mandatory external capability with no safe boundary;
- security/data-integrity issue that cannot safely be resolved.

## Quality principle

The WBS is a quality contract, not a progress-appearance checklist.

Never close work with:

- placeholders in production paths;
- fake business behavior;
- disabled validation;
- removed tests;
- skipped security checks;
- undocumented assumptions.

## Evidence principle

Evidence should be executable or externally observable whenever practical:

- tests;
- typecheck/lint/build;
- migration verification;
- API proof;
- browser/mobile proof;
- security/authorization proof;
- concurrency/idempotency proof;
- recovery/performance proof.

## Multi-agent safety

Multiple agents may work sequentially on the repository, but they must share the same repository state model.

Before a task:

- inspect git status and recent commits;
- inspect the execution state;
- preserve valid existing work;
- never assume another agent's uncommitted changes exist.

Avoid concurrent edits to the same files.

## Agent-provider independence

The KAVRIQO repository does not require any specific model, IDE, API gateway, or AI router.

OmniRoute is an OPTIONAL external model/API gateway. It may route a coding agent to free or paid model providers, but it is not part of KAVRIQO runtime architecture and must not be required by the application.

Removing or replacing OmniRoute must not change:

- WBS;
- task IDs;
- architecture;
- business rules;
- tests;
- release scope.

## Cost-aware execution

Free/low-cost model use is allowed and expected where practical.

Cost constraints must never reduce:

- acceptance criteria;
- security;
- testing;
- tenant isolation;
- booking integrity;
- financial integrity;
- documentation/evidence requirements.

## Scope protection

Future capabilities may be represented by interfaces/adapters when the frozen architecture requires them, but future behavior must not be implemented before its scheduled release/phase.

## Final completion

Release readiness is determined by repository phase gates and final release gates, not by an IDE status, a model's confidence, or a router's response.
