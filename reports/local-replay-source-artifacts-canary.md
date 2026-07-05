# Local Replay Source Artifacts Canary

Task: 103

Gate: `generic_local_replay_canonical_source_artifacts_blocked`

## Frozen Acceptance Matrix

| Requirement | Result |
| --- | --- |
| Use only `.local/deadem/replays/inbox/partida_010.dem` | passed |
| Map input to `replay_010` | passed |
| Produce parser source summary | passed |
| Produce match-state timeline source artifact | blocked |
| Produce match-state quality source artifact | blocked |
| Produce one-second player reconciliation or equivalent | blocked |
| Produce death event source artifact or explicit status | blocked |
| Produce death validation source artifact or explicit status | blocked |
| Produce respawn source artifact or explicit status | blocked |
| Produce objective inventory source artifact or explicit status | blocked |
| Produce objective lifecycle source artifact or explicit status | blocked |
| Keep full artifacts local-only | passed |
| Avoid canonical package construction | passed |
| Avoid forbidden semantic layers | passed |
| Avoid Task 104 creation | passed |

## Result

Task 103 extended the Task 102 canary by attempting the canonical source-artifact set through `tools/generate-local-replay-source-artifacts.mjs`.

The parser source summary is ready, but replay seeking/sampling failed with:

`Unable to find an entity with index [ 2905 ]`

Because match-state timeline, one-second reconciliation, death/respawn, and objective source artifacts depend on safe seeking/sampling, they are blocked rather than fabricated or zero-filled.

## Artifact Classes

Attempted: parser source summary, match-state timeline, match-state quality, one-second player reconciliation, death events, death validation, respawn events, objective entity inventory, objective lifecycle events.

Ready: parser source summary.

Unavailable: none.

Blocked: match-state timeline, match-state quality, one-second player reconciliation, death events, death validation, respawn events, objective entity inventory, objective lifecycle events.

## Roots

Local artifact root: `.local/deadem/cache/local-replay-processing/replay_010/source-artifacts/`

Committed summary root: `output/local-replay-processing/replay_010-source-artifacts/`

## Protection Summary

- `output/replays/**` was untouched.
- `samples/**` was untouched.
- Only `partida_010.dem` was read, hashed, opened, and processed.
- Candidates 011-020 were not touched.
- Replay 005 was not read, hashed, opened, copied, or processed.
- Bot fixtures 006-008 were not processed.
- No `.dem` file or `.local` artifact was committed.
- No canonical package was constructed.
- Task 104 was not created.

## Next Blocker

The exact blocker is generic replay seeking/sampling for `partida_010.dem` through the current `deadem.Player` API. Source artifact generation cannot safely continue until that parser-level entity lookup failure is resolved without samples paths, output/replays writes, parser internals changes, canonical schema changes, or replay-specific hacks.
