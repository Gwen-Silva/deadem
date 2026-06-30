# Task 064: Validate Replay 009 Objective/Structure Factual Events Against Independent Source

Status: completed

Unlocked by: synchronized replay 009 video, controlled manual replay review, replay-009 game-client event log, replay-009 independent parser output, or replay-009 manual objective/structure timeline with enough timing anchors for comparison

Unlocked evidence: `samples/videos/replay_009_independent_validation.mp4.mp4` was accepted as an independent visual rendering path with limitations. It is not an independent match-data origin.

## Preflight Result

- Preflight decision: `independent_source_available_with_limitations`
- Source inventory: `output/replay-009-validation/independent-source-inventory.json`
- Accepted source: replay 009 video at
  `samples/videos/replay_009_independent_validation.mp4.mp4`.
- Validation gate:
  `replay_009_objective_structure_events_independently_validated_with_gaps`.
- Non-independent sources rejected: Task 062 outputs, Task 063 outputs, raw
  replay bytes without independent decoding/review, mechanics knowledge, wiki
  descriptions, and expected game behavior.

## Objective

Validate Task 063 raw factual objective/structure event observations against an
independent source without applying mechanic effects or macro interpretation.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not infer mechanic effects, objective completion, destruction, or strategic
  quality from raw events alone.
- Preserve Task 063 semantic limits: health zero is not a kill/destruction
  conclusion, and entity deletion is not an objective completion conclusion.

## Required validation

- Independent-source availability check;
- bounded sample selection;
- event-to-source comparison;
- Spirit Urn candidate health-zero audit;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation.
