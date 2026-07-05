# Task 104: Implement Forward-Only Source Artifact Sampling For Local Replay Canary

Status: completed

Gate: `generic_local_replay_forward_source_artifacts_blocked`

## Objective

Replace the Task 103 seek-dependent source-artifact sampling attempt with a bounded forward-only canary for only:

`.local/deadem/replays/inbox/partida_010.dem`

Replay ID: `replay_010`

## Result

The tool `tools/generate-local-replay-forward-source-artifacts.mjs` loads the authorized local replay, avoids replay random access, and advances only through forward parser ticks.

Task 103's exact blocker was reviewed in:

`output/local-replay-processing/replay_010-forward-source-artifacts/seek-failure-review.json`

The forward-only canary confirmed that parser load succeeds and forward advancement starts, but the same entity lookup failure appears during forward sampling:

`Unable to find an entity with index [ 2905 ]`

Forward-only sampling summary:

- ticks advanced: 953
- samples attempted: 15
- samples produced: 15
- parser load succeeded: true
- forward-only advancement worked before failure: true
- canonical package constructed: false

## Artifact Availability

Ready:

- `parser_source_summary`

Blocked:

- `match_state_timeline`
- `match_state_quality`
- `one_second_player_reconciliation_or_equivalent`
- `death_events`
- `death_validation`
- `respawn_events`
- `objective_entity_inventory`
- `objective_lifecycle_events`

## Protections

- Replay 005 was not read, hashed, copied, opened, inspected, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were not touched.
- No `samples/` path was used.
- No `output/replays/` path was modified.
- No canonical package was constructed.
- No schema validation was run.
- No spatial, mechanic, fight, rotation, pressure, macro, role, decision, or ML layer was emitted.
- No Task 105 was created.

## Outputs

Committed compact summaries:

- `output/local-replay-processing/replay_010-forward-source-artifacts/`
- `reports/local-replay-forward-source-artifacts-canary.md`

Local-only artifacts:

- `.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/`

## Validation

- `node --test tests/local-replay-forward-source-artifacts.test.mjs`
- `npm run validate:tasks`
- `npm run lint`
- `npm run check:outputs`
- `npm run codex:validate -- --task 104 --base 0b6fc2b`
- `npm run codex:review -- --task 104 --base 0b6fc2b`

`npm run check:outputs` continues to report the preexisting warning for `output/04-controller-pawn-lifecycle.json`.

## Stop

Task 105 was not created. Further work requires explicit human authorization.
