# KAVRIQO — Atomic Task Decomposition Standard

## Purpose

The high-level WBS is a roadmap, not permission to implement a large feature in one pass. Every coding agent must reduce the active WBS leaf into verifiable atomic implementation units before editing code.

## Atomic unit rule

An atomic implementation unit should normally have:

- one coherent engineering concern;
- one primary acceptance outcome;
- a bounded set of files/modules;
- clear dependencies;
- deterministic validation;
- a reversible implementation scope where practical.

Typical size: roughly 20–90 minutes of focused implementation for an experienced engineer. Larger work must be decomposed further. Do not optimize for a fixed number of subtasks; optimize for reviewability and safe verification.

## Required decomposition

Before starting a large WBS item, create or update its task record with:

1. Objective and user/business value
2. Preconditions/dependencies
3. Affected domain modules
4. Data/schema impact
5. API/contract impact
6. UI/mobile impact
7. Security/tenant impact
8. External provider impact
9. Atomic implementation units in execution order
10. Acceptance criteria for every unit
11. Validation checks for every unit
12. Evidence requirements
13. Rollback/recovery notes where appropriate

## Do not mark parent complete early

A parent WBS item is complete only when all required atomic units are complete and the parent acceptance criteria plus gate pass.

## Agent discretion

Agents may create additional atomic units when implementation reveals hidden complexity, but must:

- preserve stable WBS IDs;
- document the new unit;
- avoid scope creep;
- keep the unit within the active release;
- update dependencies and evidence.

## Quality barrier

Never use decomposition to create the appearance of progress while leaving core behavior as placeholders. An atomic unit is complete only when its acceptance behavior works and has evidence.

## Cross-cutting checks

Depending on the unit, explicitly test:

- authorization
- tenant isolation
- concurrency
- idempotency
- data integrity
- money
- localization/RTL
- accessibility
- secure media
- observability
- performance

## Portability

This standard is tool-agnostic and must work with any coding agent or IDE.