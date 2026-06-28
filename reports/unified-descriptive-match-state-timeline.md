# Unified Descriptive Match-State Timeline

## Scope

This task combines validated descriptive layers for replays 001-004. It does not process replay 005, define fights, evaluate decisions, infer intent, use semantic occupancy, or detect transitions.

## Results

- replay_001: 2992 seconds, 10 shards, player count 12-12, objective states 27-51.
- replay_002: 1835 seconds, 7 shards, player count 12-12, objective states 33-50.
- replay_003: 2280 seconds, 8 shards, player count 12-12, objective states 33-49.
- replay_004: 2013 seconds, 7 shards, player count 12-12, objective states 34-50.

## Included layers

- One-second player positions and physical lane-axis proximity evidence.
- Alive/dead intervals from canonical death and respawn events.
- Net worth and cumulative damage/healing counter deltas.
- Objective state rows and lifecycle-derived map state.

## Gate

`match_state_timeline_ready`
