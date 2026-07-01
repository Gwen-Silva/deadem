# Task 074: Resolve Replay 009 Walker Identity And Fixed Entity Coordinates

Status: blocked

Execution mode: autonomous after unlock

Unlocked by: `replay_009_fixed_entity_world_coordinates_or_walker_pairing_source_available`

## Context

Task 073 retried replay-009 world-to-map transform validation using Task 072 measured minimap landmarks. The retry correctly stopped with `replay_009_candidate_transform_not_ready` because no grounded replay/map correspondences existed.

The two earliest blockers were:

- fixed Mid Boss and Walker entities in the compact canonical outputs do not expose replay-world coordinates;
- the six replay Walker entities remain an unordered set relative to the six measured map-side Walker symbols.

Task 073 explicitly prohibited resolving this by permutation search, residual minimization, nearest projected point, player trajectories, symmetry assumptions, or post-fit selection.

## Objective

Acquire or derive, through non-circular parser or independent evidence, enough replay-side fixed-entity coordinate and identity information to pair replay Walker/Mid Boss landmarks with measured map-image landmarks before any transform residuals are inspected.

## Scope

Allowed targets:

- `CNPC_MidBoss`
- `CNPC_Boss_Tier2` Walker entities
- direct fixed-entity origin/position properties if present
- parser entity properties already recoverable from replay 009
- independent visual or manually annotated identity evidence for Walker team/lane labels

Prohibited:

- fitting a transform;
- selecting Walker pairings by residual minimization;
- trying permutations and keeping the lowest error;
- using player movement paths, lane density, symmetry, or nearest projected points;
- emitting lanes, regions, proximity, rotations, pressure, fight, objective-secure, destruction, or macro conclusions;
- applying mechanic effects;
- processing replay 005;
- processing replays 006-008.

## Required Outputs

When unblocked, create a compact report and outputs that state:

- whether fixed Mid Boss and Walker replay-world coordinates are available;
- which source field or independent evidence supports each coordinate;
- whether each Walker can be assigned to a team/lane map-side landmark before fitting;
- which correspondences are eligible for future fit and which must remain held out for validation;
- which pairings remain unresolved and why.

## Acceptance Gate

Produce exactly one:

- `replay_009_walker_identity_coordinates_ready`
- `replay_009_walker_identity_coordinates_ready_with_gaps`
- `replay_009_walker_identity_coordinates_not_ready`
- `replay_009_walker_identity_coordinates_blocked`

Use `ready` only if enough non-circular replay/map correspondences exist to retry Task 073 with at least one held-out validation anchor.
