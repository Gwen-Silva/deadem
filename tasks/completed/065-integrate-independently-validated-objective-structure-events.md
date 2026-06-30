# Task 065: Build Canonical Replay 009 Factual State Schema

Status: completed

Unlocked by: explicit user authorization after Task 064 review

## Objective

Create one canonical replay-009 factual-state layer that normalizes compatible
factual sources, preserves provenance, distinguishes parser observation from
visual validation, preserves entity generations and semantic limits, exposes
validation windows and uncertainty, supports deterministic queries, and applies
zero mechanic effects.

Integrate committed compact outputs from Tasks 056, 057, 059, 060, 061, 062,
063, and 064.

## Constraints

- Use committed compact replay-009 outputs only.
- Do not process or inspect replay 005.
- Do not process or inspect bot fixtures 006-008.
- Do not commit videos, frames, clips, replay files, full raw traces, absolute
  local paths, inferred mechanic effects, spatial guesses, or strategic
  conclusions.
- Do not infer objective completion, kills, destruction, fights, pressure,
  macro analysis, or decision quality.
- Do not resolve build 23916427, apply mechanics, project map regions, classify
  lanes, or promote candidate identities beyond existing evidence.
- Preserve Task 064 timing uncertainty as bounded windows, not exact event
  correspondence.

## Required outputs

- `schemas/canonical-replay-event.schema.json`
- `schemas/canonical-replay-entity.schema.json`
- `schemas/canonical-replay-player.schema.json`
- `schemas/canonical-replay-snapshot.schema.json`
- `output/replay-009-canonical/source-integration-matrix.json`
- `output/replay-009-canonical/player-registry.json`
- `output/replay-009-canonical/entity-registry.json`
- `output/replay-009-canonical/factual-events.jsonl`
- `output/replay-009-canonical/non-timeline-metadata.json`
- `output/replay-009-canonical/independent-validation-overlay.json`
- `output/replay-009-canonical/snapshots.jsonl`
- `output/replay-009-canonical/deduplication-audit.json`
- `output/replay-009-canonical/unmatched-validation-records.json`
- `output/replay-009-canonical/capability-matrix.json`
- `output/replay-009-canonical/validation-summary.json`
- `output/replay-009-canonical/canonical-state-gate.json`
- `output/replay-009-canonical/README.md`
- `tools/query-replay-state.mjs`
- `tests/canonical-replay-state/*`
- `reports/replay-009-canonical-factual-state-schema.md`

## Gate

Produce exactly one:

- `replay_009_canonical_factual_state_ready`
- `replay_009_canonical_factual_state_ready_with_constraints`
- `replay_009_canonical_factual_state_not_ready`
- `replay_009_canonical_factual_state_blocked`

Expected honest gate: `replay_009_canonical_factual_state_ready_with_constraints`.

## Validation

Run schema validation, source integration tests, stable event-ID tests, player
continuity tests, entity-generation tests, Task 064 overlay matching tests,
unmatched-validation preservation tests, event-level versus category-level
validation tests, synchronization-window preservation tests, deduplication
tests, chronological ordering tests, snapshot carry-forward tests, query utility
tests, provenance preservation tests, semantic-limit preservation tests,
mechanic-effect-zero tests, spatial-unavailable tests, JSON/JSONL validation,
deterministic rerun, ESLint, engine tests, video-pipeline tests, replay 005 and
bot fixture exclusion checks, task queue validation, Markdown link validation,
and Git status validation.

## Documentation

Update `README.md`, `docs/PROJECT_STATE.md`, `docs/REPOSITORY_GUIDE.md`,
`reports/INDEX.md`, and `output/README.md`.

Document that canonical does not mean independently validated, category
validation does not validate every event, visual synchronization has bounded
uncertainty, camera absence is not entity absence, entity deletion is not
destruction or completion, and mechanic effects remain unapplied.
