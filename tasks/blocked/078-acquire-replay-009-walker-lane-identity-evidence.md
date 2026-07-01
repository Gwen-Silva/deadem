# Task 078: Acquire Replay 009 Walker Lane Identity Evidence

Status: blocked

Execution mode: autonomous after explicit authorization

Blocked by: Task 077 completed and explicit authorization

Unlocked by: explicit user authorization plus a new non-coordinate evidence source capable of linking at least one replay `CNPC_Boss_Tier2` entity handle to a named Walker landmark before residual inspection

## Objective

Acquire the smallest missing evidence needed to map replay-009 Walker entity
handles to named team/lane Walker landmarks without using coordinates,
permutation search, transform residuals, or nearest-map-symbol matching.

## Context

Task 077 found six `CNPC_Boss_Tier2` Walker generations, six raw team values,
two coordinate-ready late Walker generations, and zero named team/lane
assignments. Existing video evidence remains class/set-level only, and no direct
parser field or map-resource identity link maps an individual Walker handle to a
named map-side Walker symbol.

## Allowed Evidence

- Explicit parser fields such as targetname, lane, route, spawn, owner, map
  entity ID, or stable entity name.
- Map/resource metadata that explicitly joins such a field to a named Walker
  landmark.
- Bounded video or controlled review evidence only when a non-coordinate,
  temporally unique signal links the visible Walker to one replay handle.

## Forbidden

- Replay 005.
- Replays 006-008.
- Transform fitting.
- Residual minimization.
- Walker permutation search.
- Lane identity from coordinates, symmetry, nearest landmark, or visual fit.
- Player lane membership, regions, proximity, mechanic effects, or macro
  interpretation.

## Acceptance Criteria

- Determine whether any Walker handle can be linked to a named team/lane Walker
  landmark before residual inspection.
- Preserve unresolved identities explicitly.
- Produce a gate that either unlocks a bounded transform retry or documents that
  identity evidence remains unavailable.

## Required Validation

- No-coordinate-derived identity tests.
- No-permutation-search tests.
- No-residual tests.
- JSON validation.
- Task queue validation.
- Git status validation.

## Stop Conditions

- Stop if identity would require transform residuals, coordinate fit quality, or
  permutation search.
- Stop if replay 005 or bot fixtures would need to be inspected.
