# Task 175 - Fix Manifest Batch Artifact Provenance And Regenerate Expanded 16

Status: completed

Gate: `allowlisted_death_validation_batch_provenance_fixed`

Batch runner gate: `allowlisted_death_validation_batch_emitted`

Commit base: `113c1665ad75103bb3c7d269183976eb85896b00`

## Summary

Task 175 replaced the hardcoded `generatedAt: task_171` artifact provenance in `tools/emit-allowlisted-death-validation-batch-artifacts.mjs` with manifest-controlled generation metadata. Batch manifests that emit real artifacts now require explicit `generationLabel`, `taskId`, and `runId` metadata.

The corrected manifest `expanded_16_batch_mode_pilot_provenance_fix` processed replay_001, replay_002, replay_003, replay_004, replay_009, and replay_010 through replay_020 in batch mode without `--reference-status`. It emitted 16 compact `death_validation` artifacts with `generatedAt: task_175`.

## Compact Results

- replay_001: source_events_available_with_limitations; eventCount=109; duplicateKeyCount=0; generatedAt=task_175
- replay_002: source_events_available_with_limitations; eventCount=53; duplicateKeyCount=0; generatedAt=task_175
- replay_003: source_events_available_with_limitations; eventCount=117; duplicateKeyCount=0; generatedAt=task_175
- replay_004: source_events_available_with_limitations; eventCount=58; duplicateKeyCount=0; generatedAt=task_175
- replay_009: source_events_available_with_limitations; eventCount=84; duplicateKeyCount=0; generatedAt=task_175
- replay_010: source_events_available_with_limitations; eventCount=45; duplicateKeyCount=0; generatedAt=task_175
- replay_011: source_events_available_with_limitations; eventCount=80; duplicateKeyCount=0; generatedAt=task_175
- replay_012: source_events_available_with_limitations; eventCount=81; duplicateKeyCount=0; generatedAt=task_175
- replay_013: source_events_available_with_limitations; eventCount=68; duplicateKeyCount=0; generatedAt=task_175
- replay_014: source_events_available_with_limitations; eventCount=77; duplicateKeyCount=0; generatedAt=task_175
- replay_015: source_events_available_with_limitations; eventCount=102; duplicateKeyCount=0; generatedAt=task_175
- replay_016: source_events_available_with_limitations; eventCount=73; duplicateKeyCount=0; generatedAt=task_175
- replay_017: source_events_available_with_limitations; eventCount=89; duplicateKeyCount=0; generatedAt=task_175
- replay_018: source_events_available_with_limitations; eventCount=103; duplicateKeyCount=0; generatedAt=task_175
- replay_019: source_events_available_with_limitations; eventCount=60; duplicateKeyCount=0; generatedAt=task_175
- replay_020: source_events_available_with_limitations; eventCount=83; duplicateKeyCount=0; generatedAt=task_175

All 16 artifacts have `generatedBy: tools/emit-allowlisted-death-validation-batch-artifacts.mjs` and `generatedAt: task_175`. No new artifact has `generatedAt: task_171`. Stability against Task 174 passed on replay IDs, `eventCount`, `duplicateKeyCount`, and `validationStatus`.

## Protection

No replay outside the provenance-fix manifest was processed. Replay 005 and replay_006 through replay_008 were not accessed or processed. No artifact outside `death_validation`, final facts, attribution, gameplay interpretation, raw data, field values, snapshots, full histories, parser/engine behavior change, `packages/deadem/**` change, recovery, skip, placeholder, default behavior change, parser opt-in, Java/Clarity/external parser, WSL, iaflow, Product Reviewer automation, pull/merge/cherry-pick/rebase, or Task 176 was produced.
