# Task 158 - Death Validation Compact Emission

Status: completed

Gate: `death_validation_compact_artifacts_emitted`

Commit message: `Emit death validation compact artifacts for replay 010 011`

## Summary

Task 158 emitted exactly one `death_validation` compact artifact for each
authorized replay using `schemas/death-validation-compact.schema.json`.

## Emitted Artifacts

- `output/local-replay-processing/death-validation-compact-emission/artifacts/replay_010/death_validation.json`
- `output/local-replay-processing/death-validation-compact-emission/artifacts/replay_011/death_validation.json`

## Results

- replay_010: parser completed; `eventCount: 45`;
  `duplicateKeyCount: 0`; validation status
  `source_events_available_with_limitations`.
- replay_011: parser completed; `eventCount: 80`;
  `duplicateKeyCount: 0`; validation status
  `source_events_available_with_limitations`.
- Schema validation: passed.
- Output policy audit: passed.
- Size audit: passed.

## Interpretation Limits

The emitted counts are source-observed `controller.m_iDeaths` counter-transition
candidate summaries only. They are not final death facts, not proof of death
causality, and not killer/victim/fight/objective/damage/decision attribution.

## Protections

Only replay_010 and replay_011 were processed. replay 005, replays 006-008,
candidates 012-020, `samples/**`, and `output/replays/**` were not accessed or
processed. Parser/engine behavior and `packages/deadem/**` were not modified.
No event rows, field values, player arrays, snapshots, raw replay bytes,
payloads, entityData, serializedEntities, string values, full send-table
payloads, source/canonical/match final facts, gameplay interpretation output,
parser fix, recovery, skip, placeholder, default behavior change, new opt-in,
Java, Clarity, external parser, WSL, iaflow, Product Reviewer automation, pull,
merge, cherry-pick, rebase, or Task 159 was produced.
