# Task 181 - Alive Dead Respawn Compact

## Summary

Task 181 created the compact `alive_dead_respawn` artifact class and emitted it
for the Task 177 active bounded-32 baseline.

Final gate: `alive_dead_respawn_compact_bounded32_ready`.

The runner uses only explicit manifests and compact prior artifacts:

- `participant_identity` from Task 180 for synthetic replay-local participant refs.
- `semantic_foundation` from Task 179 for readiness context.
- `death_validation.eventCount` from Task 177 as a compact bridge count.

It does not open replay files, execute the parser, emit new `death_validation`,
`semantic_foundation`, or `participant_identity` artifacts, or create final
facts.

## Runs

- Pilot: replay_010, replay_011, replay_021, replay_036.
- Pilot gate: `alive_dead_respawn_compact_pilot_ready`.
- Pilot artifacts emitted: 4.
- Bounded-32: Task 177 active baseline.
- Bounded-32 gate: `alive_dead_respawn_compact_bounded32_ready`.
- Bounded-32 artifacts emitted: 32.

## Bounded-32 Result

- `totalDeathCounterIncrementCandidates`: 2552.
- `deathValidationBridgeMatchStatus`: `matched`.
- `totalTransitionCandidates`: 0.
- `transitionRowsMaterialized`: false.
- `duplicateTransitionCandidateTotal`: 0.

The count is a source-observed counter-transition candidate total bridged from
`death_validation.eventCount`. It is not a final death count.

## Interpretation

The artifacts make alive/dead/respawn consumption available as a compact state
summary. They do not make canonical death-event design ready because current
safe inputs do not provide policy-safe per-participant normalized transition
timing rows.

The artifact explicitly does not answer:

- who died;
- who killed whom;
- whether a respawn event occurred as a final fact;
- whether an event was part of a fight or teamfight.

## Policy Boundaries

No player names, hero names, team names, raw IDs, handles, account IDs, Steam
IDs, raw player slots, raw hero IDs, raw team numbers, field values, raw ticks,
raw timestamps, map positions, killer/victim/assist attribution, final facts, or
gameplay interpretation were emitted.

## Next Step

The next useful milestone is a canonical death-event input contract review. It
should decide whether a future policy-safe transition row layer is required
before canonical death events, attribution, or teamfight detection.
