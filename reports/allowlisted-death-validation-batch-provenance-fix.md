# Allowlisted Death Validation Batch Provenance Fix

Gate: `allowlisted_death_validation_batch_provenance_fixed`.

Task 175 removed the hardcoded `generatedAt: task_171` provenance from the manifest-driven batch runner and regenerated the expanded 16 `death_validation` batch with manifest-controlled generation metadata. The runner gate was `allowlisted_death_validation_batch_emitted`, with `parityStatus: not_required`.

## Scope

Processed replays: `replay_001`, `replay_002`, `replay_003`, `replay_004`, `replay_009`, `replay_010`, `replay_011`, `replay_012`, `replay_013`, `replay_014`, `replay_015`, `replay_016`, `replay_017`, `replay_018`, `replay_019`, `replay_020`.

The provenance-fix manifest used `generationLabel: task_175`, `taskId: 175`, and `runId: expanded_16_batch_mode_pilot_provenance_fix`. Batch mode was executed without `--reference-status`.

## Results

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

Artifact provenance audit: passed.
Stability against Task 174: passed.
Schema validation: passed.
Output policy: passed.
Size audit: passed.

## Limits

This task corrected artifact provenance only. `eventCount` remains a source-observed counter transition candidate count, not a final death fact. No artifact outside `death_validation`, death events, respawn events, timelines, objective lifecycle, identity rows, attribution, field values, raw data, snapshots, full histories, source/canonical/match final facts, or gameplay interpretation was emitted.
