# Task 174 - Enable Manifest-Authorized Replay 020 And Run Expanded 16 Batch Pilot

Status: completed

Gate: `allowlisted_death_validation_expanded_16_batch_pilot_ready`

Batch runner gate: `allowlisted_death_validation_batch_emitted`

Commit base: `7353501ee8991f8678f70b2ec0621de597ed2b56`

Task 174 removed `replay_020` from the runner's global hard block while preserving global blocks for `replay_005` and replay_006 through replay_008. `replay_020` is accepted only when the manifest explicitly allowlists `replay_020` with `.local/deadem/replays/inbox/partida_020.dem`, excludes it from `blockedReplays`, uses `death_validation_compact_emission`, and passes safe path checks.

The expanded manifest `expanded_16_batch_mode_pilot` processed replay_001, replay_002, replay_003, replay_004, replay_009, and replay_010 through replay_020 in batch mode without `--reference-status`. It emitted 16 compact `death_validation` artifacts, including `replay_020`, and recorded `parityStatus: not_required`.

## Compact Results

- replay_001: source_events_available_with_limitations; eventCount=109; duplicateKeyCount=0
- replay_002: source_events_available_with_limitations; eventCount=53; duplicateKeyCount=0
- replay_003: source_events_available_with_limitations; eventCount=117; duplicateKeyCount=0
- replay_004: source_events_available_with_limitations; eventCount=58; duplicateKeyCount=0
- replay_009: source_events_available_with_limitations; eventCount=84; duplicateKeyCount=0
- replay_010: source_events_available_with_limitations; eventCount=45; duplicateKeyCount=0
- replay_011: source_events_available_with_limitations; eventCount=80; duplicateKeyCount=0
- replay_012: source_events_available_with_limitations; eventCount=81; duplicateKeyCount=0
- replay_013: source_events_available_with_limitations; eventCount=68; duplicateKeyCount=0
- replay_014: source_events_available_with_limitations; eventCount=77; duplicateKeyCount=0
- replay_015: source_events_available_with_limitations; eventCount=102; duplicateKeyCount=0
- replay_016: source_events_available_with_limitations; eventCount=73; duplicateKeyCount=0
- replay_017: source_events_available_with_limitations; eventCount=89; duplicateKeyCount=0
- replay_018: source_events_available_with_limitations; eventCount=103; duplicateKeyCount=0
- replay_019: source_events_available_with_limitations; eventCount=60; duplicateKeyCount=0
- replay_020: source_events_available_with_limitations; eventCount=83; duplicateKeyCount=0

The 15 overlapping replays matched Task 173 on `eventCount`, `duplicateKeyCount`, and `validationStatus`. `replay_020` was new and produced `eventCount=83`, `duplicateKeyCount=0`, `validationStatus=source_events_available_with_limitations`.

## Protection

No replay outside the expanded 16 manifest was processed. Replay 005 and replay_006 through replay_008 were not accessed or processed. No artifact outside `death_validation`, final facts, attribution, gameplay interpretation, raw data, field values, snapshots, full histories, parser/engine behavior change, `packages/deadem/**` change, recovery, skip, placeholder, default behavior change, parser opt-in, Java/Clarity/external parser, WSL, iaflow, Product Reviewer automation, pull/merge/cherry-pick/rebase, or Task 175 was produced.
