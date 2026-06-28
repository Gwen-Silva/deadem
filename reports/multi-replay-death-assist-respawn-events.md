# Multi-Replay Death Assist Respawn Events

## Scope

This task builds descriptive death and respawn events for replays 001-004. It does not use semantic occupancy, lane episodes, transitions, rotations, strategic interpretation, or replay 005.

## Event sources

- Direct counters: `m_iDeaths`, `m_iPlayerKills`, `m_iPlayerAssists`.
- Supporting state: `m_bAlive`, `m_iHealth`, `m_flRespawnTime`.
- Linkage and context: controller/pawn handles, team, hero, `m_iGoldNetWorth`, and one-second spatial rows.

## Results

- replay_001: 123 deaths, 117 respawns, killer resolution 84.55%, assist coverage 77.24%, position coverage 100%, economy coverage 100%.
- replay_002: 56 deaths, 54 respawns, killer resolution 89.29%, assist coverage 85.71%, position coverage 100%, economy coverage 100%.
- replay_003: 123 deaths, 119 respawns, killer resolution 92.68%, assist coverage 78.86%, position coverage 100%, economy coverage 100%.
- replay_004: 61 deaths, 56 respawns, killer resolution 95.08%, assist coverage 83.61%, position coverage 100%, economy coverage 100%.

## Limitations

- Killer and assist identity are resolved from same-second counter increments, not explicit victim-linked game events.
- Economy coverage is net-worth context only; current Deadlock soul mechanics are not assumed.
- Lane information is physical proximity only.

## Gate

`death_event_layer_ready_with_limitations`
