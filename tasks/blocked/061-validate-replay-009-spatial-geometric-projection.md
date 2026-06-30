# Task 061: Validate Replay 009 Spatial Geometric Projection

Status: blocked

Execution mode: autonomous after explicit promotion

Unlocked by: `replay_009_spatial_validation_authorized`

## Blocker

Task 060 requires a completed replay-009 spatial/geometric projection result
with gate `replay_009_spatial_geometric_projection_ready` or an explicit
ready-with-limitations gate that states which categories are safe.

## Objective

Produce the missing replay-009 spatial/geometric validation needed before
factual state detection can use map regions, objective proximity, lane/region
labels, or geometric radii.

## Required Scope

Use only replay 009. Do not process replay 005. Do not process unsupported bot
fixtures 006, 007, or 008.

Validate:

- coordinate source from replay-009 player/pawn telemetry;
- coordinate axes, units, and transformation assumptions;
- entity replacement across death/respawn;
- map compatibility for build `23916427`;
- generic map-region projection;
- lane projection only if independently supported;
- objective/structure proximity only if entity positions are reliable;
- coverage, rejected samples, out-of-bounds samples, ambiguity, and nulls;
- preservation of ambiguous or overlapping classifications.

## Required Gate

Produce exactly one:

- `replay_009_spatial_geometric_projection_ready`
- `replay_009_spatial_geometric_projection_ready_with_limitations`
- `replay_009_spatial_geometric_projection_not_ready`
- `replay_009_spatial_geometric_projection_blocked`

## Acceptance Criteria

Task 060 may only be unlocked for categories explicitly supported by this task's
gate and validation report.
