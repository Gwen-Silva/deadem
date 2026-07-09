# Semantic Foundation Compact Pilot - Task 179

## Summary

Task 179 introduced the compact `semantic_foundation` artifact class and ran it
in two manifest-controlled stages:

- pilot: `replay_010`, `replay_011`, `replay_021`, `replay_036`
- bounded-32: the active Task 177 baseline, `replay_001` through `replay_004`,
  `replay_009`, and `replay_010` through `replay_036`

Final gate: `semantic_foundation_compact_bounded32_ready`.

## What Was Investigated

The artifact checks whether compact, non-final signals are available for the
next semantic layer:

- identity mapping prerequisites
- controller/pawn relationship signal availability
- hero/team signal availability
- time/tick normalization readiness
- alive/dead/respawn prerequisites
- bridge to existing `death_validation.eventCount`

The bridge keeps `eventCount` as
`source_observed_counter_transition_candidate_count_not_final_death_fact`.

## Results

Mini-pilot passed:

- replay count: 4
- artifacts emitted: 4
- gate: `semantic_foundation_compact_pilot_ready`
- schema validation: passed
- output policy: passed
- size audit: passed
- protection audit: passed

Bounded-32 passed:

- replay count: 32
- artifacts emitted: 32
- gate: `semantic_foundation_compact_bounded32_ready`
- schema validation: passed
- output policy: passed
- size audit: passed
- protection audit: passed

Across bounded-32, compact signal coverage was:

- identity mapping status: 32 available
- hero/team mapping status: 32 available
- time normalization status: 32 available
- life-state readiness status: 32 available
- canonical death-event design readiness: 0 ready by contract

## What Exists

The project now has a compact readiness layer that can tell whether signal
categories are present without persisting names, raw values, entity IDs,
positions, per-event rows, or gameplay interpretation.

This supports a future identity mapping task.

## What Still Does Not Exist

The project still cannot answer:

- who killed whom
- whether a counter transition is a final death fact
- whether an event was a teamfight
- where an event happened
- what caused damage or an interaction
- whether a gameplay decision was good

Canonical death-event design is still blocked until identity mapping, hero/team
mapping, time normalization, and life-state contracts are explicit.

## Policy Outcome

No new `death_validation.json` artifacts were emitted. No names, raw field
values, raw entity IDs, event rows, positions, attribution, final facts, or
gameplay interpretation were emitted.

No replay outside the explicit manifests was processed. `replay_005` and
`replay_006` through `replay_008` remained blocked.

## Recommendation

Next milestone: design the first policy-safe identity mapping artifact using the
bounded-32 `semantic_foundation` baseline. Do not proceed directly to canonical
death events, attribution, or teamfight detection.
