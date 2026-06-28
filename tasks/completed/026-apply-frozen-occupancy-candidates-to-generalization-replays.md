# Task 026: Apply Frozen Occupancy Candidates To Generalization Replays

Status: completed
Execution mode: autonomous
Project stage: Multi-replay frozen-model generalization
Related experiment: frozen occupancy generalization
Priority: high
Depends on: task 025 completed with gate `full_spatial_timeline_ready_with_limitations`
Unlocked by: `output/replays/full-spatial-timeline-gate.json` gate equals `full_spatial_timeline_ready` or `full_spatial_timeline_ready_with_limitations`
Blocks: methodological review of cross-replay occupancy behavior

## Objective

Apply already frozen occupancy candidates to replay 002, replay 003, and replay 004 using the full spatial timelines, without recalibrating thresholds, changing geometry, processing replay 005, or claiming semantic correctness.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- this task file
- `reports/full-multi-replay-spatial-timeline.md`
- `output/replays/full-spatial-timeline-gate.json`
- `output/replays/multi-replay-spatial-comparison.json`
- `output/replays/replay_002/full-spatial-timeline.json`
- `output/replays/replay_002/full-spatial-timeline.rows.jsonl`
- `output/replays/replay_003/full-spatial-timeline.json`
- `output/replays/replay_003/full-spatial-timeline.rows.jsonl`
- `output/replays/replay_004/full-spatial-timeline.json`
- `output/replays/replay_004/full-spatial-timeline.rows.jsonl`
- frozen model scripts and outputs required to reproduce:
  - original experiment 23 model;
  - conservative point revision;
  - original episode boundaries with evidence annotations;
  - sequential architectures only when exact parameters are frozen.

## Work requested

- Evaluate each replay independently before aggregate comparison.
- Apply only reproducible frozen candidates.
- Respect the 5-second timeline limitation from task 025.
- Measure coverage, abstention, contradiction evidence, sensitivity, episode count, fragmentation, episode duration, and cross-replay consistency where supported.

## Constraints

- Do not recalibrate using replays 002-004.
- Do not select new thresholds per replay.
- Do not process replay 005.
- Do not detect transitions.
- Do not claim semantic correctness, transition readiness, strategic lane assignment, or optimality.
- Do not use replay 005 for debugging, threshold selection, architecture comparison, or candidate selection.

## Inputs

Full spatial timeline manifests and JSONL rows for replays 002-004, frozen model artifacts, and prior frozen-model scripts needed for reproducible application.

## Outputs

- `output/replays/replay_002/frozen-occupancy-candidate-results.json`
- `output/replays/replay_003/frozen-occupancy-candidate-results.json`
- `output/replays/replay_004/frozen-occupancy-candidate-results.json`
- `output/replays/frozen-occupancy-generalization-comparison.json`
- `output/replays/frozen-occupancy-generalization-gate.json`
- `reports/frozen-occupancy-generalization.md`

## Acceptance criteria

- Every evaluated candidate is traceable to a frozen prior artifact or script.
- No per-replay threshold tuning occurs.
- Replay 005 remains untouched.
- The task reports limitations from the 5-second spatial timeline.
- Exactly one documented gate is produced.

## Required validation

- ESLint on new or modified JavaScript.
- JSON or JSONL parse validation.
- Output-size checks.
- Deterministic-repeatability check.
- Frozen-parameter provenance check.
- Replay 005 protection check.
- Task queue validation.
- Git checks confirming replay files, previous outputs, and replay 005 were not modified.

## Gate result

Allowed results:

- `frozen_occupancy_generalization_ready_for_review`
- `frozen_occupancy_generalization_limited_by_timeline_resolution`
- `frozen_occupancy_generalization_inconsistent`
- `frozen_occupancy_generalization_blocked`

## Documentation updates

Update `reports/latest.md` and `docs/PROJECT_STATE.md` only when justified.

## Git scope

Use explicit staging only. Commit separately from task 025.

## Expected report

Summarize candidates evaluated, frozen provenance, per-replay metrics, aggregate comparison, timeline-resolution limitations, conclusions allowed, prohibited conclusions, gate result, and next required decision.

## Stop conditions

Stop if frozen model parameters cannot be reproduced, if replay 005 would be needed, or after producing the frozen generalization gate. Do not promote transition detection automatically.
