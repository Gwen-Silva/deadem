# Task 028: Compare Frozen Occupancy On One-Second Timelines

Status: completed
Execution mode: autonomous
Project stage: Multi-replay frozen-model resolution comparison
Related experiment: one-second frozen occupancy comparison
Priority: high
Depends on: task 027 completed with gate `one_second_spatial_ready` or `one_second_spatial_ready_with_limitations`
Unlocked by: `output/replays/one-second-spatial-gate.json` gate starts with `one_second_spatial_ready`
Blocks: replay 005 final-holdout readiness decision

## Objective

Apply the same frozen occupancy candidates to the one-second spatial timelines for replays 001-004 and compare behavior against the prior five-second results without recalibration.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `tasks/completed/027-optimize-one-second-multi-replay-spatial-extraction.md`
- `reports/one-second-multi-replay-spatial-extraction.md`
- `reports/frozen-occupancy-generalization.md`
- `scripts/apply-frozen-occupancy-generalization.js`
- `output/replays/one-second-spatial-gate.json`
- `output/replays/frozen-candidate-provenance.json`
- `output/replays/frozen-occupancy-generalization-comparison.json`
- `output/replays/replay_001/five-second-control/frozen-occupancy-candidate-results.json`
- `output/replays/replay_002/frozen-occupancy-candidate-results.json`
- `output/replays/replay_003/frozen-occupancy-candidate-results.json`
- `output/replays/replay_004/frozen-occupancy-candidate-results.json`
- one-second spatial manifests and shards for replays 001-004

## Work requested

- Apply only reproducible frozen candidates with unchanged parameters.
- Compare one-second versus five-second behavior within each replay.
- Report point coverage delta, contradiction delta, instability delta, episode count delta, fragmentation delta, duration delta, brief-contact recovery, gap splitting or merging, and candidate-specific resolution sensitivity.
- Do not process replay 005.

## Constraints

- Do not recalibrate thresholds.
- Do not tune per replay.
- Do not claim semantic correctness.
- Do not detect transitions or rotations.
- Do not use replay 005.

## Inputs

One-second spatial timeline shards for replays 001-004, prior five-second frozen candidate outputs, and frozen candidate provenance.

## Outputs

- `output/replays/frozen-occupancy-one-second-results.json`
- `output/replays/frozen-occupancy-one-second-resolution-comparison.json`
- `output/replays/frozen-occupancy-one-second-gate.json`
- `reports/frozen-occupancy-one-second-resolution-comparison.md`

## Acceptance criteria

- Candidate parameters match the frozen provenance.
- One-second rows are evaluated for replays 001-004 only.
- Comparison reports all required deltas by replay and candidate.
- Replay 005 remains unprocessed.
- Exactly one gate is produced.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing and output-size checks.
- No-threshold-change check.
- Replay 005 protection check.
- Task queue validation.
- Git verification that `.dem` files and prior outputs were not modified.

## Gate result

Allowed results:

- `one_second_frozen_comparison_ready_for_method_review`
- `one_second_frozen_comparison_resolution_sensitive`
- `one_second_frozen_comparison_inconsistent`
- `one_second_frozen_comparison_blocked`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` when justified.

## Git scope

Use explicit staging only. Commit separately from task 027.

## Expected report

Summarize candidates, one-second versus five-second deltas, resolution sensitivity, allowed limited uses, prohibited conclusions, replay 005 readiness, gate result, and remaining limitations.

## Stop conditions

Stop after producing the gate and report. Do not promote replay 005 processing unless a frozen hypothesis and pass/fail criteria are explicitly pre-registered by this task and repository policy permits promotion.
