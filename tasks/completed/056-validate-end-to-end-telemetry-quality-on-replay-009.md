# Task 056: Validate End-To-End Telemetry Quality On Replay 009

Status: completed
Execution mode: autonomous
Project stage: parser compatibility and telemetry validation
Depends on: task 054 and task 055 completed

## Objective

Validate whether `samples/replay_009_normal.dem` produces internally consistent, temporally continuous, and analysis-ready telemetry for a normal human match from build 23916427.

## Constraints

- Do not execute task 053.
- Do not process replay 005.
- Do not continue debugging replays 006, 007, or 008.
- Use replays 001-004 only for limited parser regression/comparison where useful.
- Do not infer strategy, intent, roles, rotations, macro decisions, or player skill.

## Required outputs

- `output/replay-009-validation/source-inventory.json`
- `output/replay-009-validation/match-envelope.json`
- `output/replay-009-validation/player-roster.json`
- `output/replay-009-validation/player-roster.csv`
- `output/replay-009-validation/controller-pawn-lifecycle.jsonl`
- `output/replay-009-validation/controller-pawn-validation.json`
- `output/replay-009-validation/position-quality-summary.json`
- `output/replay-009-validation/position-gap-samples.json`
- `output/replay-009-validation/economy-quality-summary.json`
- `output/replay-009-validation/combat-event-quality-summary.json`
- `output/replay-009-validation/pause-audit.json`
- `output/replay-009-validation/disconnect-reconnect-audit.json`
- `output/replay-009-validation/cross-source-consistency.json`
- `output/replay-009-validation/telemetry-coverage-scorecard.json`
- `output/replay-009-validation/downstream-readiness.json`
- `output/replay-009-validation/validation-summary.json`
- `output/replay-009-validation/validation-gate.json`
- `output/replay-009-validation/README.md`
- `reports/replay-009-end-to-end-telemetry-validation.md`

## Gate

Produce exactly one:

- `replay_009_telemetry_validated`
- `replay_009_telemetry_usable_with_known_gaps`
- `replay_009_telemetry_not_analysis_ready`
- `replay_009_validation_blocked`

## Validation

Run engine tests, video-pipeline tests, ESLint, JSON/JSONL/CSV validation, deterministic rerun, replay 001-004 parser regression, replay 005 exclusion verification, unsupported bot fixture exclusion verification, task queue validation, documentation-link validation, and Git status validation.
