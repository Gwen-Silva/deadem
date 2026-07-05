# Local Replay Forward Source Artifacts Canary

Replay ID: `replay_010`
Input: `.local/deadem/replays/inbox/partida_010.dem`
Gate: `generic_local_replay_forward_source_artifacts_blocked`

## Task 103 Failure Review

Task 103 gate: `generic_local_replay_canonical_source_artifacts_blocked`
Exact error: `Unable to find an entity with index [ 2905 ]`

## Forward-Only Result

Forward-only advancement worked: `true`
Ticks advanced: `953`
Samples attempted: `15`
Samples produced: `15`
Stopped reason: `forward_sampling_error`
Forward-stage error: `Unable to find an entity with index [ 2905 ]`

No random-access replay seek was used. No canonical package, spatial layer, mechanic effect, fight, rotation, pressure, macro, role, decision, or ML output was produced.

## Artifact Availability

- `parser_source_summary`: ready; records=1
- `match_state_timeline`: blocked; records=n/a
- `match_state_quality`: blocked; records=n/a
- `one_second_player_reconciliation_or_equivalent`: blocked; records=n/a
- `death_events`: blocked; records=n/a
- `death_validation`: blocked; records=n/a
- `respawn_events`: blocked; records=n/a
- `objective_entity_inventory`: blocked; records=n/a
- `objective_lifecycle_events`: blocked; records=n/a

## Protection

Replay 005 access: `false`
Bot fixture access: `false`
Candidates 011-020 touched: `false`
Local-only artifact root: `.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/`
