# Task 073: Retry Replay 009 Transform Validation With Measured Landmarks

Status: completed

Execution mode: autonomous

Unlocked by: `replay_009_independent_landmark_coordinates_ready_with_limitations`

## Context

Task 070 historical result was `replay_009_candidate_transform_not_ready` because no independent map-side landmark coordinates were available. Do not modify or reinterpret Task 070; it was correct for its evidence.

Task 072 now provides `replay_009_independent_landmark_coordinates_ready_with_limitations`, eight local-only images, 34 measured landmarks, five planned fit anchors, and two reserved validation anchors.

## Objective

Fit and validate, if scientifically supported, a bounded 2D transformation from replay world coordinates to the selected replay-009 minimap image coordinate system.

Answer only whether independently identified fixed replay landmarks can be mapped to measured minimap pixels using a simple deterministic transform that also succeeds on held-out landmarks.

## Constraints

- Do not answer lane, region, proximity, rotation, pressure, fight, macro, or decision-quality questions.
- Do not rewrite Task 070 historical outputs.
- Do not fit a transform unless correspondences are identity-grounded before residual inspection.
- Do not use residual minimization, permutations, team/lane swaps, nearest projected points, symmetry-generated points, player positions, Spirit Urn candidates, deletion locations, lane-density paths, boxes, statues, or overlay dots to assign anchors.
- Preserve the Task 072 held-out validation split where valid.
- Do not update canonical replay spatial fields.
- Do not project all player trajectories into production outputs.
- Do not emit lane or region classifications.
- Do not calculate proximity.
- Do not mark spatial capability generally ready.
- Do not process replay 005.
- Do not process replays 006-008.
- Do not commit source images, VPKs, extracted maps, screenshots, trajectory plots over map images, lane/region definitions, objective proximity, mechanic effects, or macro conclusions.

## Required Inputs

- `output/replay-009-landmark-measurement/measured-landmarks.json`
- `output/replay-009-landmark-measurement/replay-landmark-correspondence-candidates.json`
- `output/replay-009-landmark-measurement/fit-validation-anchor-plan.json`
- `output/replay-009-landmark-measurement/cross-image-registration.json`
- `output/replay-009-landmark-measurement/orientation-annotations.json`
- `output/replay-009-landmark-measurement/measurement-gate.json`
- Replay-side evidence from Tasks 060-065.
- Task 062 class observability.
- Task 063 entity lifecycle events.
- Task 064 visual-validation overlays.
- Task 071 human annotation packet.

## Required Work

1. Validate Task 072 input integrity and source-image exclusion.
2. Audit replay-world and minimap coordinate bases, including z handling.
3. Build and freeze a landmark identity ledger before fitting.
4. Resolve Walker identities only from pre-residual evidence. If individual Walker pairing cannot be grounded, exclude unordered Walkers and return `not_ready` when minimum requirements are unmet.
5. Preregister only translation 2D, rigid 2D, similarity 2D, axis-reflected similarity 2D, and affine 2D.
6. Define residual acceptance before fitting in pixels, normalized width, and normalized diagonal units.
7. Fit only eligible preregistered models using deterministic methods.
8. Use held-out anchors only after fitting; low fit error with poor held-out performance rejects the transform.
9. Run topology/orientation checks for fitted models.
10. Run leave-one-out sensitivity only if at least five grounded anchors are available.
11. Preserve build/source limitations: replay build `23916427` remains unresolved, installed VPK is newer/possible only, and participant map testimony is advisory.
12. Create only compact fixed-landmark projection audit outputs.

## Required Outputs

- `output/replay-009-transform-retry/input-integrity.json`
- `output/replay-009-transform-retry/coordinate-basis-audit.json`
- `output/replay-009-transform-retry/landmark-identity-ledger.json`
- `output/replay-009-transform-retry/model-preregistration.json`
- `output/replay-009-transform-retry/residual-acceptance-policy.json`
- `output/replay-009-transform-retry/candidate-transform-results.json`
- `output/replay-009-transform-retry/held-out-validation-results.json`
- `output/replay-009-transform-retry/topology-validation.json`
- `output/replay-009-transform-retry/transform-sensitivity.json`
- `output/replay-009-transform-retry/build-source-limitations.json`
- `output/replay-009-transform-retry/fixed-landmark-projection-audit.json`
- `output/replay-009-transform-retry/transform-decision.json`
- `output/replay-009-transform-retry/validation-summary.json`
- `output/replay-009-transform-retry/transform-gate.json`
- `output/replay-009-transform-retry/README.md`
- `reports/replay-009-transform-validation-retry.md`

## Decision Classes

Produce exactly one:

- `validated_replay_minimap_transform`
- `validated_replay_minimap_transform_with_source_limitations`
- `coarse_visualization_transform_only`
- `insufficient_grounded_correspondences`
- `held_out_validation_failed`
- `topology_validation_failed`

## Gate

Produce exactly one:

- `replay_009_candidate_transform_validated`
- `replay_009_candidate_transform_validated_with_limitations`
- `replay_009_candidate_transform_not_ready`
- `replay_009_candidate_transform_rejected`

Use `not_ready` when correspondence identity remains insufficient, minimum fit or validation counts are unavailable, or unordered Walker matching cannot be grounded.

## Follow-Up Behavior

If validated or validated with limitations, create one blocked task to integrate a versioned candidate transform into a non-production spatial projection layer.

If not ready due to unordered Walker identity, create one blocked task specifically to resolve replay-side Walker team/lane identities; do not acquire more generic map images.

If held-out validation or topology fails, create one blocked diagnosis task; do not increase model complexity automatically.

## Required Validation

Run:

- Task 072 input integrity tests;
- coordinate-basis tests;
- identity-ledger freeze tests;
- no-permutation-search tests;
- anchor eligibility tests;
- fit/validation disjointness tests;
- held-out anchor count tests;
- model preregistration tests;
- model-complexity preference tests;
- deterministic fitting tests;
- residual-policy tests;
- held-out validation tests;
- topology/orientation tests;
- leave-one-out sensitivity tests;
- build/source limitation preservation tests;
- fixed-landmark-only output tests;
- no-lane/no-region/no-proximity tests;
- mechanic-effect-zero tests;
- JSON validation;
- deterministic rerun;
- ESLint;
- engine tests;
- video-pipeline tests;
- task queue validation;
- Markdown/link validation;
- Git status validation.

## Acceptance Criteria

Produce a transform-validation decision with explicit fit anchors, held-out validation anchors, residual policy, topology checks when a model is fitted, build/source limitations, and a gate. Verify explicitly that replay 005 was not read or processed, replays 006-008 were not processed, source images were not committed, no Walker permutation search was performed, no production spatial fields were updated, no lanes/regions/proximity/rotations/pressure/fights/macro were emitted, and mechanic effects applied equals 0.
