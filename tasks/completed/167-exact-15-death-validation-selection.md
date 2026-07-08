# Task 167 - Select Exact 15 Replay Set For Death Validation Expansion

Status: completed

Gate: `exact_15_death_validation_selection_ready`

Commit message: `Select exact 15 death validation replay set`

Task 167 materialized the exact 15 replay set for a future
`death_validation_compact_emission` expansion. The selected set preserves the
five historical eligible replays and the first ten local candidate entries:

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

`replay_020` was excluded by the administrative criterion
`administrative_excess_candidate_highest_numbered`. This is not a replay quality
judgment, parser failure conclusion, replay corruption conclusion, Source 2
semantics conclusion, factual correctness conclusion, or gameplay conclusion.

Real emission remains unauthorized in this task. A future task may request
authorization for `death_validation_compact_emission` on this exact 15-replay
set. `eventCount` remains a source-observed counter transition candidate count,
not a final death fact, and future emission must remain limited to the compact
`death_validation` class unless separately authorized.

No replay was accessed, opened, hashed, copied, inspected, parsed, or processed.
No runner was executed. No new real artifact, final fact, gameplay
interpretation, death event, respawn event, timeline, objective lifecycle,
identity row, attribution, field value, raw data, snapshot, full history,
parser/engine behavior change, `packages/deadem/**` change, recovery, skip,
placeholder, default behavior change, parser opt-in, Java/Clarity/external
parser, WSL, iaflow, Product Reviewer automation, pull/merge/cherry-pick/rebase,
or Task 168 was produced.

Recommended next action:
`authorize_exact_15_death_validation_compact_emission`.
