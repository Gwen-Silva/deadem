# Replay 009 Fixed Entity Coordinate Resolution

Task 076 resolves bounded replay-side coordinates for `CNPC_MidBoss` and `CNPC_Boss_Tier2`.

## Gate

`replay_009_fixed_entity_coordinates_ready_with_gaps`

## Result

- Target generations: 8
- Raw coordinate observations: 4
- Complete vector triplets: 4
- Complete cell triplets: 4
- Accepted reconstruction formula: `vector_only`
- Resolved coordinate observations: 4
- Target generations with coordinates: 2
- Stable Walkers: 2
- Moving/uncertain Walkers: 4
- Walker teams resolved: 0
- Final Walker lanes assigned: 0
- Fit-eligible entities: 0

## Boundary

The coordinate basis is supported by replay parser/player controls, but no world-to-map transform was fitted. Walker lane identities remain unassigned, Walker one-to-one map correspondence remains unresolved, and no regions, proximity, canonical spatial fields, mechanic effects, or macro interpretation were emitted.
