# Frozen Occupancy Generalization

## Five-second resolution control

Replay 001 was processed into `output/replays/replay_001/five-second-control/` using the same five-second grid, row schema, and lane-axis projection logic as task 025. Exact fine-resolution full-spatial rows do not exist, so replay 001 fine comparison uses existing experiment 24 artifact adapters and is marked as partially comparable.

## Frozen provenance

Evaluated candidates:

- original_experiment_23_balanced: reproducible_with_schema_adapter, source experiments/23-calibrate-lane-occupancy.js, parameters {"maxCoreDistance":380,"maxOccupancyDistance":520,"minMargin":45,"deploymentRadius":500,"baseCoreRadius":240,"minStableSeconds":5,"interruptionTolerance":3,"envelopeMultiplier":1.25}.
- conservative_point_revision_combined: reproducible_with_schema_adapter, source experiments/24-revise-lane-occupancy-model.js, parameters {"maxCoreDistance":380,"maxOccupancyDistance":520,"minMargin":45,"deploymentRadius":500,"baseCoreRadius":240,"minStableSeconds":5,"interruptionTolerance":3,"envelopeMultiplier":1.25}.
- hysteresis_state_machine: reproducible_with_schema_adapter, source experiments/24-prototype-uncertainty-aware-lane-episode-segmentation.js, parameters {"id":"hysteresis_state_machine","enterSeconds":4,"uncertainTolerance":5,"rejoinGap":4,"minDuration":5,"minSupportRatio":0.45,"maxContradictionRatio":0.28}.
- windowed_evidence_accumulation: reproducible_with_schema_adapter, source experiments/24-prototype-uncertainty-aware-lane-episode-segmentation.js, parameters {"id":"windowed_evidence_accumulation","windowSeconds":5,"supportMargin":2,"minDuration":5,"minSupportRatio":0.42,"maxContradictionRatio":0.3}.
- constrained_dynamic_programming: reproducible_with_schema_adapter, source experiments/24-prototype-uncertainty-aware-lane-episode-segmentation.js, parameters {"id":"constrained_dynamic_programming","switchPenalty":2.2,"impossibleLaneSwitchPenalty":4,"unknownPenalty":0.35,"minDuration":5,"minSupportRatio":0.4,"maxContradictionRatio":0.32}.

Excluded candidates:

- annotated_original_episodes: resolution_incompatible; The candidate preserves replay 001 experiment 23 episode boundaries. Those boundaries are replay-specific outputs, not a frozen cross-replay construction rule for five-second timelines.

Neutral lane mapping was derived from structural topology only: {"lane_1":"lane_axis_3","lane_2":"lane_axis_1","lane_3":"lane_axis_2"}.

## Per-replay results

- replay_002: 4404 rows
  - original_experiment_23_balanced: coverage 90.87%, contradictions 2342, instability 34.9%, episodes 1894.
  - conservative_point_revision_combined: coverage 33.72%, contradictions 0, instability 3.3%, episodes 910.
  - hysteresis_state_machine: coverage 33.72%, contradictions 0, instability 3.3%, episodes 10.
  - windowed_evidence_accumulation: coverage 33.72%, contradictions 0, instability 3.3%, episodes 1020.
  - constrained_dynamic_programming: coverage 33.72%, contradictions 0, instability 3.3%, episodes 643.
- replay_003: 5472 rows
  - original_experiment_23_balanced: coverage 90.27%, contradictions 3138, instability 34.63%, episodes 2319.
  - conservative_point_revision_combined: coverage 29.07%, contradictions 0, instability 3.24%, episodes 1024.
  - hysteresis_state_machine: coverage 29.07%, contradictions 0, instability 3.24%, episodes 29.
  - windowed_evidence_accumulation: coverage 29.07%, contradictions 0, instability 3.24%, episodes 1180.
  - constrained_dynamic_programming: coverage 29.07%, contradictions 0, instability 3.24%, episodes 759.
- replay_004: 4836 rows
  - original_experiment_23_balanced: coverage 90.61%, contradictions 2755, instability 32.9%, episodes 2083.
  - conservative_point_revision_combined: coverage 30.16%, contradictions 0, instability 3.4%, episodes 1057.
  - hysteresis_state_machine: coverage 30.16%, contradictions 0, instability 3.4%, episodes 19.
  - windowed_evidence_accumulation: coverage 30.16%, contradictions 0, instability 3.4%, episodes 1155.
  - constrained_dynamic_programming: coverage 30.16%, contradictions 0, instability 3.4%, episodes 725.

## Cross-replay consistency

- original_experiment_23_balanced: consistent_limited_behavior; coverage range 90.27..90.87%, contradiction range 2342..3138.
- conservative_point_revision_combined: consistent_limited_behavior; coverage range 29.07..33.72%, contradiction range 0..0.
- hysteresis_state_machine: consistent_limited_behavior; coverage range 29.07..33.72%, contradiction range 0..0.
- windowed_evidence_accumulation: consistent_limited_behavior; coverage range 29.07..33.72%, contradiction range 0..0.
- constrained_dynamic_programming: consistent_limited_behavior; coverage range 29.07..33.72%, contradiction range 0..0.

## Resolution effects

- original_experiment_23_balanced: not_comparable; Fine-resolution full-spatial rows are unavailable for exact replay 001 candidate application.
- conservative_point_revision_combined: not_comparable; Fine-resolution full-spatial rows are unavailable for exact replay 001 candidate application.
- hysteresis_state_machine: not_comparable; Fine-resolution full-spatial rows are unavailable for exact replay 001 candidate application.
- windowed_evidence_accumulation: not_comparable; Fine-resolution full-spatial rows are unavailable for exact replay 001 candidate application.
- constrained_dynamic_programming: not_comparable; Fine-resolution full-spatial rows are unavailable for exact replay 001 candidate application.

## Allowed conclusions

- Frozen point-level lane-proximity evidence can be computed across replays 002-004 without per-replay threshold changes.
- Base/deployment exclusion evidence may be used as a descriptive non-semantic filter.

## Prohibited conclusions

- Semantic lane occupancy correctness.
- Transition readiness or rotation detection.
- Strategic lane assignment or optimality.
- Any conclusion based on replay 005.

## Gate result

`frozen_occupancy_generalization_ready_for_review`

Replay 005 readiness: `not_ready_resolution_confounded`.
