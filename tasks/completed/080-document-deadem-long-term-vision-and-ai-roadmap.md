# Task 080: Document Deadem Long-Term Vision And AI Roadmap

Status: completed

Execution mode: autonomous

Unlocked by: explicit user authorization to create one documentation-only roadmap task

## Objective

Create the canonical long-term strategic document for Deadem as an independent,
evidence-bounded Deadlock replay-analysis platform, and update existing
navigation docs with concise links and status alignment.

## Constraints

- Documentation only.
- Do not implement models, parser changes, source reorganization, placeholder
  packages, runtime features, or schema migrations.
- Do not change scientific gates or claim capabilities that do not exist.
- Preserve replay 005 as protected final holdout.
- Do not process replay 005 or bot fixtures 006-008.
- Do not run replay extraction.

## Required outputs

- `docs/PROJECT_VISION_AND_ROADMAP.md`
- concise references in `README.md`, `docs/PROJECT_STATE.md`,
  `docs/NEXT_MILESTONE.md`, `docs/REPOSITORY_GUIDE.md`, and `reports/INDEX.md`
  when appropriate
- `reports/deadem-long-term-vision-and-ai-roadmap-documentation.md`

## Acceptance criteria

- The roadmap distinguishes current capabilities from long-term goals.
- GPT/Codex are documented as development assistants, not runtime dependencies.
- Optional LLM explanation is separated from factual state, model inference,
  confidence, provenance, and limitations.
- The roadmap preserves the current spatial-first milestone and Task 078 state:
  raw Walker factions are supported, while Walker lane/map-landmark identity and
  transform retry remain blocked.
- Implementation changes, runtime capability changes, and gate changes are zero.

## Required validation

- Markdown/link validation by repository-available checks or path existence.
- Task queue validation.
- Documentation consistency checks by grep/search where no dedicated checker
  exists.
- `npm.cmd test`.
- `npm.cmd run lint`.
- Git status validation.

## Stop conditions

- Stop if the task would require processing any replay.
- Stop if the roadmap would require a methodological decision beyond
  documentation.
- Stop if existing repository state contradicts a requested roadmap claim.
