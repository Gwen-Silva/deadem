# Multi-Replay Objective Lifecycle

## Scope

This task maps objective entities and lifecycle evidence for replays 001-004. It does not process replay 005, group fights, judge objective decisions, infer strategic intent, use semantic occupancy, or detect transitions.

## Objective classes discovered

- `CNPC_TrooperBoss`
- `CNPC_BarrackBoss`
- `CNPC_Boss_Tier2`
- `CNPC_Boss_Tier3`
- `CNPC_BaseDefenseSentry`
- `CNPC_MidBoss`
- `CNPC_Neutral_SinnersSacrifice`
- `CCitadel_HeroTestOrbSpawner`
- `CCitadel_PickupItemSpawner`

## Replay results

- replay_001: 47 stable objectives, 6 guardians, 6 walkers, 19 base structures, 2 patrons, 1 Mid Boss entities, 11 urn-related entities, 4422 lifecycle events.
- replay_002: 47 stable objectives, 6 guardians, 6 walkers, 19 base structures, 2 patrons, 1 Mid Boss entities, 11 urn-related entities, 1519 lifecycle events.
- replay_003: 47 stable objectives, 6 guardians, 6 walkers, 19 base structures, 2 patrons, 1 Mid Boss entities, 11 urn-related entities, 2190 lifecycle events.
- replay_004: 47 stable objectives, 6 guardians, 6 walkers, 19 base structures, 2 patrons, 1 Mid Boss entities, 11 urn-related entities, 2221 lifecycle events.

## Damage reconciliation

- replay_001: health loss 3995518, objective-damage counters 109328, timing correlation 14.124%.
- replay_002: health loss 546385, objective-damage counters 63113, timing correlation 20.567%.
- replay_003: health loss 1695399, objective-damage counters 60632, timing correlation 24.764%.
- replay_004: health loss 622506, objective-damage counters 53257, timing correlation 19.894%.

## Limits

- Objective names are neutral structural labels derived from replay evidence.
- Objective damage counters are aggregate player counters, not direct source-target attribution.
- Patron, Mid Boss, urn, protection, and phase fields remain limited where direct lifecycle state was not exposed.

## Gate

`objective_lifecycle_ready_with_limitations`
