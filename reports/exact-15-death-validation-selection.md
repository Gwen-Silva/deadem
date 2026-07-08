# Exact 15 Death Validation Selection

Gate: `exact_15_death_validation_selection_ready`

Task 167 materialized the exact 15 replay set for a future
`death_validation_compact_emission` expansion. This task did not access,
open, hash, copy, inspect, parse, or process any replay file. It did not run
any dry-run or emission runner and did not emit real artifacts.

## Selection

The selected set keeps the five historical eligible replays and the first ten
local candidate entries:

- replay_001 -> `samples/partida_001.dem`
- replay_002 -> `samples/partida_002.dem`
- replay_003 -> `samples/partida_003.dem`
- replay_004 -> `samples/partida_004.dem`
- replay_009 -> `samples/replay_009_normal.dem`
- replay_010 -> `.local/deadem/replays/inbox/partida_010.dem`
- replay_011 -> `.local/deadem/replays/inbox/partida_011.dem`
- replay_012 -> `.local/deadem/replays/inbox/partida_012.dem`
- replay_013 -> `.local/deadem/replays/inbox/partida_013.dem`
- replay_014 -> `.local/deadem/replays/inbox/partida_014.dem`
- replay_015 -> `.local/deadem/replays/inbox/partida_015.dem`
- replay_016 -> `.local/deadem/replays/inbox/partida_016.dem`
- replay_017 -> `.local/deadem/replays/inbox/partida_017.dem`
- replay_018 -> `.local/deadem/replays/inbox/partida_018.dem`
- replay_019 -> `.local/deadem/replays/inbox/partida_019.dem`

## Exclusion

`replay_020` is excluded only by the administrative criterion
`administrative_excess_candidate_highest_numbered`. This is not a quality,
parser failure, replay corruption, Source 2 semantics, factual correctness, or
gameplay conclusion.

## Current Authorization

Real emission is still not authorized. A future task may request authorization
for `death_validation_compact_emission` on this exact 15-replay set. `eventCount`
must remain a source-observed counter transition candidate count, not a final
death fact.

## Protections

`replay_005` remains the protected final holdout. `replay_006` through
`replay_008` remain blocked unsupported bot fixtures. No final facts, gameplay
interpretation, attribution, field values, raw data, snapshots, full histories,
or spatial/macro/mechanics/fight/decision/ML outputs were produced.
