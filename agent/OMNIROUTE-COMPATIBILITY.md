# KAVRIQO — OmniRoute and Agent-Provider Compatibility

## Status

Accepted implementation policy.

## Purpose

KAVRIQO is intentionally independent of any coding-agent vendor, IDE, model provider, or AI routing gateway.

The repository plan, architecture, WBS, task state, evidence and gates are the source of truth.

The coding worker may be:

- Replit Agent
- Codex / Codex CLI
- Claude Code
- Gemini CLI
- Cursor
- Windsurf
- Cline / Roo / Kilo / OpenCode
- another capable coding agent

## OmniRoute role

OmniRoute is an OPTIONAL external AI gateway/router used to route an agent's model/API traffic.

It is not part of the KAVRIQO runtime architecture.
It must never be added as a KAVRIQO application dependency merely to implement the product.

Conceptually:

```text
Human
  ↓
Coding Agent / IDE
  ↓
(Optional) OmniRoute or another AI gateway
  ↓
Selected AI model/provider
  ↓
Coding Agent
  ↓
KAVRIQO repository
```

Removing OmniRoute must not affect the application.

Replacing OmniRoute with another gateway must not affect the application or WBS.

## Free/low-cost operation

The project must remain implementable with zero paid IDE/agent dependency.

The agent may use free or locally available models/services where practical, but implementation quality gates remain unchanged.

Do not weaken requirements because the model/provider is free.

## Agent-neutral requirements

Never use instructions that depend on:

- a specific IDE task queue;
- Replit-specific persistent state;
- a proprietary agent command;
- a vendor-specific memory feature;
- a model-specific tool name.

Repository state is portable and must be sufficient for recovery.

## Environment and secrets

Use `.env.example` only for variable names and placeholders.

Real secrets may be injected by any compatible mechanism:

- Replit Secrets
- local environment
- Docker Compose environment/secret files
- CI/CD secret store
- cloud secret manager
- another secure environment facility

Never require one specific secret manager in the application design.

## MCP/A2A/skills

External agent protocols or skill systems may be used by the coding agent, but they are optional developer tooling.

Project Skills under `.agents/skills/` are the stable repository-local guidance layer.

External skills/repositories must be reviewed before adoption.

## State/recovery

A new agent must be able to resume from:

- `agent/EXECUTION_STATE.md`
- `agent/IMPLEMENTATION-WBS-V2.md`
- `agent/TASK_REGISTRY.md`
- active task specification
- `agent/EVIDENCE_LOG.md`
- accepted architecture/product/security documents

No agent memory is required to resume.

## Compatibility test

A plan change is agent-compatible only if the same repository can be executed by two different capable coding agents without changing business rules, architecture, task IDs, acceptance criteria or evidence semantics.
