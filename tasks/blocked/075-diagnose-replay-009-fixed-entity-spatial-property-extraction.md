# Task 075: Diagnose Replay 009 Fixed Entity Spatial Property Extraction

Status: blocked

Execution mode: autonomous after unlock

Unlocked by: `replay_009_parser_spatial_property_extraction_authorized`

## Context

Task 074 inspected existing compact replay-009 outputs for `CNPC_MidBoss` and `CNPC_Boss_Tier2`. The gate was `replay_009_walker_identity_coordinates_not_ready`.

The earliest missing representation is a replay-side fixed-entity world coordinate source. The compact Task 062/063/065 path exposes target class identity, lifecycle, health, and component/reference-style properties, but no usable direct or explicitly component-resolved world-coordinate property.

## Objective

Diagnose whether the replay-009 parser can expose fixed-entity spatial properties for `CNPC_MidBoss` and `CNPC_Boss_Tier2` through a narrow, target-filtered extraction path.

## Scope

Allowed:

- `samples/replay_009_normal.dem`
- target classes `CNPC_MidBoss` and `CNPC_Boss_Tier2`
- explicit scene-node/body-component references for those target entities
- compact property-path and value samples needed to prove or disprove coordinate availability

Forbidden:

- replay 005;
- replays 006-008;
- full unbounded raw property traces;
- transform fitting;
- Walker permutation search;
- lane, region, or proximity output;
- mechanic effects;
- macro interpretation.

## Required Outcome

Produce a compact diagnosis stating whether the missing layer is:

- parser does not expose fixed-entity coordinate properties;
- coordinate properties exist but the Task 062 compact inventory omitted them;
- coordinates exist only through unresolved component references;
- coordinates exist but require a new bounded extraction stage.

Do not update canonical spatial fields in this task.

## Acceptance Gate

Produce exactly one:

- `replay_009_fixed_entity_spatial_properties_ready`
- `replay_009_fixed_entity_spatial_properties_ready_with_gaps`
- `replay_009_fixed_entity_spatial_properties_not_exposed`
- `replay_009_fixed_entity_spatial_properties_blocked`
