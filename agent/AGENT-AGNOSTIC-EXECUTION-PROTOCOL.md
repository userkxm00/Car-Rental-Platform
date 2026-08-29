# KAVRIQO — Agent-Agnostic Execution Protocol

## Purpose

This project must be executable by Replit Agent, Codex, Claude Code, Gemini, Cursor, or another capable coding agent without changing the plan's semantics.

The plan is repository-owned, not IDE-owned.

## Canonical execution hierarchy

```text
Product / Business Truth
        ↓
Architecture / ADRs
        ↓
Release Scope
        ↓
Implementation WBS v2
        ↓
Phase
        ↓
Workstream
        ↓
Task
        ↓
Subtask (local decomposition allowed)
        ↓
Verification
        ↓
Evidence
        ↓
Gate
        ↓
Next eligible work
```

## Agent session rule

An agent session may be interrupted at any time. The next session must resume from repository state, not from memory or an IDE task list.

Use:
- `agent/EXECUTION_STATE.md`
- `agent/IMPLEMENTATION-WBS-V2.md`
- relevant phase/task documents
- `agent/EVIDENCE_LOG.md`

Temporary IDE task states such as cancelled, stopped, expired or archived do not override repository state.

## Planning rule

A high-level feature is never considered complete merely because a parent task is marked done.

The agent must identify and complete all lower-level WBS tasks required by the active release.

If the agent discovers that a task is still too large, it may create local subtasks in a linked task record. The stable parent task ID must remain unchanged.

## Work selection

Select the next eligible item using:

1. active release;
2. current phase;
3. dependencies;
4. WBS order;
5. first unfinished item.

Do not select work because it is easier, visually attractive, or available in an IDE queue.

## Autonomous progression

After successful verification:

```text
Task DONE
→ evidence
→ state update
→ continue
```

After a phase gate passes:

```text
Phase COMPLETE
→ evidence
→ state update
→ next phase
```

No routine confirmation is required.

## Human decision boundary

Stop only for a genuinely unresolved decision affecting product policy, legal/regulatory interpretation, material architecture, irreversible production action, or a required external capability with no safe boundary.

Normal coding errors, failing tests, dependency problems, migrations, UI defects, or provider SDK issues must be investigated and repaired autonomously.

## Quality principle

The WBS is not a checklist for appearances. It is a contract for implementation quality.

A task cannot be closed with:
- placeholder code;
- fake data in production paths;
- disabled validation;
- removed tests;
- skipped security checks;
- undocumented assumptions.

## Evidence principle

Evidence must be executable and reproducible whenever practical.

Examples:
- command output;
- test results;
- migration verification;
- browser/mobile test evidence;
- security test evidence;
- concurrency test evidence;
- screenshots for meaningful UI validation.

## Multi-agent safety

If two agents work on the repository, they must use the same execution state and WBS. Never assume another agent's uncommitted work exists.

Before starting a task, inspect current git state and recent changes.

Avoid editing files concurrently when possible.

## Scope protection

The active release is authoritative. Future work can be prepared through interfaces/adapters, but must not be implemented early without a roadmap change.

## Final completion

Release readiness is determined by phase gates and final release gates, not by an IDE's task status or an agent's self-declared confidence.
