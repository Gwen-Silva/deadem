# Replay 009 Factual State Detection

Task 060 ran in partial non-spatial mode after Task 061 produced gate `replay_009_spatial_geometric_projection_ready_with_limitations`.

## Results

- Player identities: 12, teams 6v6.
- Life-state events: 166 (84 deaths, 82 respawns).
- Death consistency: consistent; 84/84 counter events matched lifecycle deaths.
- Respawn transitions: 84; unresolved 2.
- Net worth: `m_iGoldNetWorth` endpoint summaries for 12 players and 2 team snapshots.
- Objective/structure entity classification: unavailable from compact replay-009 outputs.
- Spatial outputs: unavailable by Task 061 limitations; no proximity, regions, lanes, or deposit candidates emitted.
- Knowledge rules applied: 0. Ambiguous rules preserved per mechanic.

## Gate

`replay_009_factual_state_detection_ready_with_gaps`

## Highest-Impact Gap

`objective_and_structure_entity_property_observability`: the next factual-state improvement is a non-spatial entity/property inventory for objective and structure candidates. It should not attempt map projection or mechanic effects.

## Validation

The generated validation file records deterministic hashes, replay 005 protection, bot fixture exclusion, and mechanic-effect count zero.
