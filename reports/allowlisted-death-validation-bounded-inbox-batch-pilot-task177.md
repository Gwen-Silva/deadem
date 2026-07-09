# Task 177 - Run Bounded Inbox Batch Pilot With 16 New Authorized Replays

Status: completed

Gate: `allowlisted_death_validation_bounded_inbox_batch_pilot_ready`

Batch runner gate: `allowlisted_death_validation_batch_emitted`

## Summary

Task 177 discovered the authorized inbox candidates by filename listing only.
The 16 new files were already renamed as `partida_021.dem` through
`partida_036.dem`, so numeric filename mapping was not used. No duplicate
numeric/renamed variants were present.

The manifest `bounded_inbox_batch_pilot_32_task177` processed the Task 175
expanded 16 baseline plus `replay_021` through `replay_036` in batch mode
without `--reference-status`. It emitted 32 compact `death_validation` artifacts
with `generatedAt: task_177`.

## New Replay Results

- replay_021: eventCount=99, duplicateKeyCount=0
- replay_022: eventCount=89, duplicateKeyCount=0
- replay_023: eventCount=72, duplicateKeyCount=0
- replay_024: eventCount=89, duplicateKeyCount=0
- replay_025: eventCount=67, duplicateKeyCount=0
- replay_026: eventCount=64, duplicateKeyCount=0
- replay_027: eventCount=95, duplicateKeyCount=0
- replay_028: eventCount=67, duplicateKeyCount=0
- replay_029: eventCount=60, duplicateKeyCount=0
- replay_030: eventCount=63, duplicateKeyCount=0
- replay_031: eventCount=91, duplicateKeyCount=0
- replay_032: eventCount=62, duplicateKeyCount=0
- replay_033: eventCount=118, duplicateKeyCount=0
- replay_034: eventCount=80, duplicateKeyCount=0
- replay_035: eventCount=37, duplicateKeyCount=0
- replay_036: eventCount=117, duplicateKeyCount=0

All new replay artifacts report
`validationStatus: source_events_available_with_limitations` and
`generatedAt: task_177`.

## Validation

Schema validation, output policy audit, size audit, protection audit, and
baseline overlap stability passed. The 16 overlapping Task 175 baseline replays
matched on replay IDs, `eventCount`, `duplicateKeyCount`, and
`validationStatus`. `parityStatus` is `not_required`.

## Protection

Inventory did not open, hash, copy, byte-read, inspect, or parse replay files.
Replay 005 was not accessed or processed. Replays 006 through 008 were not
processed. No replay outside the bounded manifest was processed. No artifact
outside `death_validation`, final facts, attribution, field values, raw data,
snapshots, full histories, gameplay interpretation, parser/engine behavior
change, `packages/deadem/**` change, recovery, skip, placeholder, default
behavior change, parser opt-in, Java/Clarity/external parser, WSL, iaflow,
Product Reviewer automation, pull/merge/cherry-pick/rebase, or Task 178 was
produced.

`eventCount` remains a source-observed counter transition candidate count, not a
final death fact.
