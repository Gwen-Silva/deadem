# Participant Identity Compact - Task 180

## Summary

Task 180 introduced the compact `participant_identity` artifact class and ran it
in two manifest-controlled stages:

- pilot: `replay_010`, `replay_011`, `replay_021`, `replay_036`
- bounded-32: the active Task 177 baseline, `replay_001` through `replay_004`,
  `replay_009`, and `replay_010` through `replay_036`

Final gate: `participant_identity_compact_bounded32_ready`.

## What Was Created

The new artifact emits replay-local synthetic refs:

- `participant_##`
- `controller_ref_##`
- `pawn_ref_##`
- `team_ref_##`
- `hero_ref_##`

These refs are not raw player slots, account IDs, Steam IDs, entity IDs,
handles, hero IDs, or team numbers. Raw values can be used in memory during the
authorized replay run, but they are not persisted.

## Results

Mini-pilot passed:

- replay count: 4
- artifacts emitted: 4
- gate: `participant_identity_compact_pilot_ready`
- schema validation: passed
- output policy: passed
- size audit: passed
- protection audit: passed

Bounded-32 passed:

- replay count: 32
- artifacts emitted: 32
- gate: `participant_identity_compact_bounded32_ready`
- schema validation: passed
- output policy: passed
- size audit: passed
- protection audit: passed

Across bounded-32:

- participant identity coverage: 32 available
- hero coverage: 32 available
- team coverage: 32 available
- time foundation coverage: 32 available
- life-state foundation coverage: 32 available
- ready for alive/dead/respawn artifact: true
- ready for canonical death-event design: false
- ready for attribution: false

## What This Enables

The project now has a safe identity foundation that can be consumed by a future
alive/dead/respawn artifact. It provides stable synthetic participant refs within
each replay and compact status/coverage information for hero, team, time, and
life-state prerequisites.

## What This Does Not Enable

The artifact does not answer:

- who died
- who killed whom
- whether a counter transition is a final death fact
- whether an event was a teamfight
- where an event happened
- what caused damage or an interaction

It emits no names, raw IDs, handles, raw slots, raw hero/team values, field
values, event rows, per-event ticks/timestamps, positions, attribution, final
facts, or gameplay interpretation.

## Recommendation

Next milestone: build a compact `alive_dead_respawn` artifact using
`participant_identity` refs and preserving the same output policy. Canonical
death events, attribution, and teamfight detection should remain blocked until
life-state transitions have their own schema and consumption contract.
