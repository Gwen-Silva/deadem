# Replay 009 Candidate World-To-Map Transform Validation

Task: `070-validate-replay-009-candidate-world-to-map-transform`

Gate: `replay_009_candidate_transform_not_ready`

Decision: `insufficient_independent_anchors`

## Summary

Task 070 inspected the local-only preferred geometry candidate from Task 069, `geom_installed_dl_midtown_vpk`, and built a bounded resource inventory without committing or extracting proprietary map assets.

Local asset access succeeded, and the VPK header was readable. A simple VPK-directory parser recorded the package signature and tree metadata, while the local GameTracking package index provided 250 bounded spatially relevant resource entries. These entries include map, minimap, boss, sentry, navigation, and related resource-name candidates, but they do not expose independent coordinates.

No transform was fitted.

## Tooling

- `task070_vpk_directory_parser`: used for local header/tree metadata only.
- `task070_gametracking_index_filter`: used for bounded resource-name inventory.
- `valveresourceformat`: not installed locally and not used.

No external tool clone, binary, map image, frame, or map package was committed.

## Landmark Result

Task 070 reviewed the eight supported replay landmark candidates from Task 069:

- 2 Mid Boss entity generations;
- 6 Walker entities.

The task did not find independent map-side coordinates for the same landmarks. Resource names provide identity clues only; they are not coordinates and cannot become fit anchors.

Compact canonical replay outputs also do not provide objective/structure world coordinates for these anchors, so replay/map correspondences remain unusable for fitting.

## Model Preregistration

The following model families were preregistered:

- translation;
- rigid 2D;
- similarity 2D;
- axis-reflected similarity 2D;
- affine 2D.

All were ineligible because there were zero accepted independent correspondences and zero held-out validation anchors.

## Transform Decision

Selected decision: `insufficient_independent_anchors`.

Fit residual: not applicable.

Validation residual: not applicable.

Topology checks: not evaluable.

Build compatibility remains unresolved because the installed candidate map is newer or otherwise not directly mapped to replay build `23916427`.

## Boundaries

Task 070 did not emit:

- production transform;
- map regions;
- lane labels;
- objective proximity;
- spatial events;
- mechanic effects;
- rotations, pressure, fights, or macro interpretation.

Replay 005 and bot fixtures 006-008 were not read or processed.

## Required Next Input

The earliest missing layer is controlled landmark-coordinate acquisition. A future task must obtain independent map-side coordinates for accepted landmarks, preferably from a local legal extraction path or controlled manual coordinate capture, and preserve at least one supported anchor as held-out validation evidence.
