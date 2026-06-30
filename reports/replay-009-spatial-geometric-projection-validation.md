# Replay 009 Spatial Geometric Projection Validation

Gate: `replay_009_spatial_geometric_projection_ready_with_limitations`

## Result

Replay 009 player coordinate source is usable with constraints: 26,052 player-second samples, 100% coordinate presence, no null rows, no duplicate timestamps, no non-monotonic timestamps, and largest sampled gap 0 seconds from Task 056.

No accepted map transform was produced. Existing geometry is not independently mapped to build `23916427`, and no replay-009 world bounds, generic region geometry, lane geometry, objective geometry, or structure geometry were validated.

## Task 060 Unlock

Safe if separately authorized:

- player life state
- team net worth
- entity presence/classification without spatial interpretation

Blocked:

- raw objective/structure position unless extracted later
- generic region membership
- lane/region membership
- objective-player proximity
- near-deposit-location
- structure-region association

## Epistemic Boundary

Valid coordinates do not imply a valid map transform. A future map transform would not by itself validate lane occupancy, objective auras, combat participation, rotations, pressure, or strategic interpretation.

## Pause Limitation

Parser seconds remain the time basis. No pause-adjusted or active-game-time durations are produced.

## Validation

The task generated compact deterministic outputs only. Replay 005 and bot fixtures 006-008 were not processed.
