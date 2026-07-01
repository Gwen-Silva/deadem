# Task 077: Resolve Replay 009 Walker Identity Before Transform Retry

Status: blocked

Execution mode: autonomous after explicit authorization

Blocked by: Task 076 completed and explicit user authorization

Unlocked by: explicit user authorization after Task 076 gate `replay_009_fixed_entity_coordinates_ready_with_gaps`

## Context

Task 076 extracted bounded replay-side coordinates for two late `CNPC_Boss_Tier2`
Walker generations and preserved raw team values for all six Walker generations.
It did not resolve which replay Walker entity corresponds to which map-side
Walker symbol. Therefore no transform retry is eligible yet.

## Objective

Resolve Walker identity using direct parser metadata and bounded independent
video evidence only, before any transform fitting.

## Scope

Allowed:

- replay 009 bounded Walker entity metadata from Task 076
- direct parser fields such as raw team, owner, spawn, target, and name fields
- bounded replay-009 video review only if already available
- Task 072 map-side Walker landmark labels as candidate targets

Forbidden:

- replay 005
- replays 006-008
- transform fitting
- Walker permutation search
- residual minimization
- lane membership output
- regions or proximity
- mechanic effects
- macro interpretation

## Acceptance Criteria

- Determine whether each replay Walker can be mapped to a map-side Walker symbol
  before residual inspection.
- Preserve unresolved identities explicitly.
- Do not assign lanes from coordinates or transform fit quality.
- Produce exactly one gate:
  - `replay_009_walker_identity_ready_for_transform_retry`
  - `replay_009_walker_identity_ready_with_gaps`
  - `replay_009_walker_identity_not_ready`
  - `replay_009_walker_identity_blocked`

## Stop Conditions

- Stop if identity cannot be resolved without permutation search or transform
  residuals.
- Stop if replay 005 or bot fixtures would need to be inspected.
