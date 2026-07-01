# Replay 009 Walker Identity And Fixed Coordinate Resolution

Task 074 inspected existing compact replay-009 evidence for `CNPC_MidBoss` and `CNPC_Boss_Tier2`.

## Result

Gate: `replay_009_walker_identity_coordinates_not_ready`

The task found 16 target-class position/reference candidates, but zero usable world-coordinate properties, zero direct coordinates, and zero component-resolved coordinates. Walker team and lane identity remain unresolved for all six entities before transform fitting.

## Why Not Ready

- Canonical spatial fields for fixed Mid Boss and Walker entities remain unavailable.
- Committed compact property inventories expose component/reference-style fields but no explicit coordinate-bearing transform for the target entities.
- Existing video support is class-level or timing-window evidence and does not identify which replay Walker handle corresponds to which map Walker symbol.
- No fit or held-out validation correspondence can be promoted without replay-world coordinates and pre-fit identity.

## Boundaries

No transform was fitted. No Walker permutation search, residual matching, lane/region/proximity output, mechanic effect, or macro interpretation was produced.
