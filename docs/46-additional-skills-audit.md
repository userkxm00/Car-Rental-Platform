# 46 — Additional Skills Audit

## Scope
Reviewed:
- https://github.com/Leonxlnx/taste-skill
- https://github.com/oomol-lab/open-connector
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Internal reference: https://github.com/userkxm00/pos-global

## Decisions

### Taste-Skill — ADOPT PATTERNS
Repository is MIT licensed and currently very popular. Its core value for this project is the design-review mindset: prevent generic AI-generated UI and make visual decisions deliberate. We use a local adaptation rather than importing the entire repository.

Adopted in:
`.agents/skills/visual-design-taste/SKILL.md`

### UI UX Pro Max — ADOPT PATTERNS
Repository is MIT licensed and provides broad design intelligence for professional UI/UX across platforms. It is especially relevant to our Marketplace, agency dashboards, public landing pages, and mobile operations. We use a focused project-specific adaptation instead of importing its full tooling/data set.

Adopted in:
`.agents/skills/ui-ux-pro-max-adapted/SKILL.md`

### Open Connector — PARTIAL ADOPTION
Repository is Apache-2.0 and is an integration/auth gateway for many external SaaS providers, with credential boundaries, action contracts, scopes, policies, runtime tokens, and inspectable logs. We do NOT need the project as a dependency for Release 1.

Useful architectural lesson:
- provider-neutral integration interfaces
- credential boundary
- explicit scopes/policies
- external IDs and execution logs
- replaceable providers

Adopted in:
`.agents/skills/integration-connector-architecture/SKILL.md`

## Compatibility with current architecture

The three additions do not override the Architecture Freeze. They improve implementation quality within the frozen architecture.

### UI task example
Load:
- frontend-design
- ui-ux-pro-max-adapted
- visual-design-taste
- frontend-design-review
- design-system-governance
- rtl-i18n-quality
- visual-qa

### Integration example
Load:
- integration-connector-architecture
- api-contracts
- relevant domain skill
- security/testing skills

## Do not add

Do not add OpenConnector as a runtime dependency merely because it can integrate many providers. The project already has an integration abstraction and Release 1 should avoid unnecessary infrastructure.

Do not load all UI/UX skills simultaneously for every task. Choose the smallest useful set and run the review/QA skills at the end.
