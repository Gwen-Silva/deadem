# Deadem Long-Term Vision And AI Roadmap Documentation

Task: `080-document-deadem-long-term-vision-and-ai-roadmap`

Gate: `deadem_long_term_vision_and_ai_roadmap_documented`

## Files Created

- `docs/PROJECT_VISION_AND_ROADMAP.md`
- `reports/deadem-long-term-vision-and-ai-roadmap-documentation.md`

## Files Updated

- `README.md`
- `docs/PROJECT_STATE.md`
- `docs/NEXT_MILESTONE.md`
- `docs/REPOSITORY_GUIDE.md`
- `reports/INDEX.md`
- `reports/latest.md`
- `tasks/completed/080-document-deadem-long-term-vision-and-ai-roadmap.md`

## Roadmap Scope

The roadmap documents 13 maturity phases, numbered Phase 0 through Phase 12.
It separates parser reliability, factual state, spatial foundation, mechanics,
event detection, macro descriptive state, cross-replay generalization, learned
models, decision datasets, strategic/value modeling, and mature product
platform targets.

## Current-State Facts Used

- Normal human replay parsing is supported for fixtures 001-004 and 009.
- Replay 005 remains the protected final holdout.
- Replays 006-008 remain unsupported solo-bot fixtures.
- Replay 009 has a canonical factual foundation and inspector workflows with
  constraints.
- Build `23916427` mechanics mapping remains unresolved.
- Active-game time, map transform, lanes, regions, proximity, mechanic effects,
  fights, rotations, map pressure, decision analysis, and learned models remain
  unavailable.
- Task 078 supports raw Walker team `3 -> Sapphire/Archmother` and raw team
  `2 -> Amber/Hidden King`, while Walker lane/map-landmark identity and
  transform retry remain blocked.

## Consistency Corrections

- Documented GPT/Codex as development assistants, not runtime dependencies.
- Preserved the selected spatial-foundation milestone in `docs/NEXT_MILESTONE.md`.
- Kept roadmap phases separate from current capabilities.
- Avoided treating Task 078 as unlocking transform fitting.

## Validation

- Markdown/path references checked against repository files.
- Task queue validation run.
- Documentation consistency searches run for roadmap/current-state terms.
- `npm.cmd test` run.
- `npm.cmd run lint` run.

Known validation note: `npm.cmd run check:outputs` may still report the
pre-existing oversized `output/04-controller-pawn-lifecycle.json`; this task did
not modify output artifacts.

## Change Classification

- Implementation changes: zero.
- Runtime capability changes: zero.
- Gates changed: zero.
- Replay processing: none.
