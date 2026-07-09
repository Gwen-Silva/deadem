# Task 177 - Run Bounded Inbox Batch Pilot With 16 New Authorized Replays

Status: completed

Gate: `allowlisted_death_validation_bounded_inbox_batch_pilot_ready`

Batch runner gate: `allowlisted_death_validation_batch_emitted`

## Summary

Task 177 mapped the 16 newly authorized renamed inbox files
`partida_021.dem` through `partida_036.dem` to `replay_021` through
`replay_036`. Inventory was filename-listing only; no replay was opened,
hashed, copied, byte-read, inspected, parsed, or snapshotted during discovery.

The bounded manifest `bounded_inbox_batch_pilot_32_task177` included the Task
175 expanded 16 baseline plus the 16 new replay IDs and ran in `runnerMode:
batch` without `--reference-status`. The batch emitted 32 compact
`death_validation` artifacts with `generatedAt: task_177`.

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

## Validation

Schema validation passed. Output policy audit passed. Size audit passed.
Protection audit passed. `parityStatus` is `not_required`. The 16 baseline
replays matched Task 175 on replay IDs, `eventCount`, `duplicateKeyCount`, and
`validationStatus`.

## Protection

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
