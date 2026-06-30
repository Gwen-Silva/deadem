# Task 064: Validate Replay 009 Objective/Structure Factual Events Against Independent Source

Status: blocked

Unlocked by: synchronized replay 009 video, controlled manual replay review, replay-009 game-client event log, replay-009 independent parser output, or replay-009 manual objective/structure timeline with enough timing anchors for comparison

Blocked by: independent-source preflight found no accepted independent source associated with replay 009

## Preflight Result

- Preflight decision: `independent_source_missing`
- Source inventory: `output/replay-009-validation/independent-source-inventory.json`
- Required source: synchronized replay 009 video is preferred. A controlled
  manual replay review, game-client event log independent of the production
  parser, independent parser output, or manually annotated replay-009 timeline
  is also acceptable when it includes timing anchors.
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
