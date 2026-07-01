# Task 076: Resolve Replay 009 Fixed Entity Coordinates And Walker Identities

Status: blocked

Execution mode: autonomous after explicit authorization

Blocked by: Task 075 completed and explicit user authorization

Unlocked by: explicit user authorization to execute Task 076 after Task 075 gate `replay_009_fixed_entity_spatial_properties_ready_with_gaps`

## Context

Task 075 diagnosed replay-009 fixed-entity spatial-property extraction for `CNPC_MidBoss` and `CNPC_Boss_Tier2`.

Task 075 found that the parser exposes bounded `CBodyComponent.m_vecX/Y/Z` and `CBodyComponent.m_cellX/Y/Z` coordinate-like fields for some `CNPC_Boss_Tier2` target evidence, including CREATE payloads. The missing layer from Tasks 062-074 was therefore compact-filter omission, not a parser decoder failure.

Task 075 did not fit a world-to-map transform, assign Walker lanes, emit regions, compute proximity, apply mechanics, or update canonical spatial fields.

## Objective

Create a bounded fixed-entity coordinate resolution layer for replay 009 that extracts replay-side coordinates for all `CNPC_MidBoss` and `CNPC_Boss_Tier2` entity generations where directly exposed, and determines whether enough identity-grounded replay-side fixed landmarks exist to retry transform validation.

## Scope

Allowed:

- `samples/replay_009_normal.dem`
- target classes `CNPC_MidBoss` and `CNPC_Boss_Tier2`
- parser-exposed `CBodyComponent.m_vecX/Y/Z`
- parser-exposed `CBodyComponent.m_cellX/Y/Z`
- Task 075 compact diagnosis outputs
- Task 072 independent map-image landmark coordinates, if needed only for identity-grounded correspondence planning

Forbidden:

- replay 005
- replays 006-008
- transform fitting
- Walker lane assignment
- Walker permutation search
- lane, region, or proximity output
- objective contest state
- mechanic activation or mechanic effects
- macro interpretation

## Acceptance Criteria

- Extract bounded replay-side coordinate observations for target entity generations.
- Preserve both vector and cell coordinate bases separately.
- Do not merge entity generations by entity index alone.
- Record which target generations remain missing or unresolved.
- Record whether Mid Boss and Walker replay-side landmarks are ready for a later transform retry.
- Preserve all map-version and build-compatibility limitations.
- Produce exactly one gate:
  - `replay_009_fixed_entity_coordinates_ready`
  - `replay_009_fixed_entity_coordinates_ready_with_gaps`
  - `replay_009_fixed_entity_coordinates_not_ready`
  - `replay_009_fixed_entity_coordinates_blocked`

## Stop Conditions

- Stop if target coordinates cannot be deterministically extracted from direct parser fields.
- Stop if the task would require map transform fitting or lane identity inference.
- Stop if replay 005 or bot fixtures would need to be inspected.
