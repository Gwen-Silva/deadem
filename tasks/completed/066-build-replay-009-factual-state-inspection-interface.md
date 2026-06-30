# Task 066: Build Replay 009 Factual State Inspection Interface

Status: completed

Unlocked by: explicit user authorization after Task 065 review

## Objective

Build a local static inspection and report interface that makes the canonical
replay-009 factual data understandable and reviewable without requiring manual
JSON inspection.

The interface must answer factual questions about player life state, team net
worth, canonical objective/structure entities, independent validation overlays,
candidate-only records, ambiguity, provenance, confidence, and semantic limits.

It must not answer strategic or mechanic-effect questions such as which team was
strategically ahead, whether a fight was good, whether an objective was secured,
whether a structure was destroyed, whether Mid Boss was killed, whether
Rejuvenator was claimed, whether an Urn was deposited, or whether a player made
the correct macro decision.

## Required architecture

- `tools/generate-replay-inspection-report.mjs`
- `tools/export-replay-factual-report.mjs`
- `tools/serve-replay-inspector.mjs`
- `output/replay-009-inspection/`

Use plain HTML, CSS, JavaScript, and JSON. Do not add a large frontend
framework, remote server, database, API key, cloud service, or external
analytics dependency.

## Required views

1. Overview
2. Capability matrix
3. Timeline table sourced only from `factual-events.jsonl`
4. Snapshot viewer
5. Player inspector
6. Entity inspector
7. Independent-validation view
8. Non-timeline metadata view
9. Expandable provenance panels for displayed records

## Constraints

- Consume committed canonical replay-009 outputs only.
- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not commit replays, videos, frames, clips, caches, absolute local paths,
  inferred mechanic effects, spatial guesses, or strategic conclusions.
- Do not apply mechanics or resolve build 23916427.
- Do not infer objective completion, destruction, kills, claims, deposits,
  secured objectives, fights, pressure, macro interpretation, or decision
  quality.
- Do not treat category-level validation as event-level validation.
- Preserve visual synchronization uncertainty and camera-coverage limitations.
- Use only parser seconds and demo ticks. Do not produce active-game,
  pause-adjusted, spatial-region, lane, objective-proximity, or map-position
  assertions.
- Timeline view must use only `factual-events.jsonl`; non-timeline metadata
  remains separate and must not receive synthetic timestamps.

## Required outputs

- `output/replay-009-inspection/index.html`
- `output/replay-009-inspection/app.js`
- `output/replay-009-inspection/styles.css`
- `output/replay-009-inspection/data/overview.json`
- `output/replay-009-inspection/data/players.json`
- `output/replay-009-inspection/data/entities.json`
- `output/replay-009-inspection/data/events.json`
- `output/replay-009-inspection/data/metadata.json`
- `output/replay-009-inspection/data/snapshots.json`
- `output/replay-009-inspection/data/validation-overlays.json`
- `output/replay-009-inspection/data/capabilities.json`
- `output/replay-009-inspection/data/generation-summary.json`
- `output/replay-009-inspection/README.md`
- `reports/replay-009-factual-state-inspection-interface.md`

## Required validation

- report-generator tests;
- canonical-input schema tests;
- timeline/metadata separation tests;
- shared query-filter tests;
- player inspector tests;
- entity inspector tests;
- validation-overlay rendering tests;
- synchronization-window display tests;
- semantic-limit rendering tests;
- candidate-label preservation tests;
- export-report tests;
- deterministic generation;
- HTML link/path validation;
- JSON/JSONL validation;
- ESLint;
- engine tests;
- video-pipeline tests;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation;
- Git status validation.

## Gate

Produce exactly one:

- `replay_009_factual_state_inspector_ready`
- `replay_009_factual_state_inspector_ready_with_constraints`
- `replay_009_factual_state_inspector_not_ready`
- `replay_009_factual_state_inspector_blocked`

Expected honest gate: `replay_009_factual_state_inspector_ready_with_constraints`.
