# Task 112: Diagnose Field-Level Consumption For Pre-Recovery Payload Mismatches

Status: completed

Base commit: `1381ac7ef8fb2c107d514c5b3bc3eb9062811780`

Gate: `local_replay_pre_recovery_mismatch_field_consumption_diagnosed`

## Objective

Diagnose why the four present UPDATEs in replay_010 packet ordinal 953 mismatch
`serializedEntities payloadBits` versus after-command extractor consumption in
the default pre-recovery path.

This task was diagnostic only. It did not add recovery, fix the parser,
construct a canonical package, emit factual artifacts, or create Task 113.

## Inputs

- Authorized replay input:
  `.local/deadem/replays/inbox/partida_010.dem`
- Replay ID: `replay_010`
- Prior compact baseline:
  `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/`

## Implementation

- Added opt-in `diagnosePreRecoveryFieldConsumption` recovery diagnostics.
- Added extractor diagnostic hooks that are disabled by default.
- Recorded only counts and cursor positions:
  mutation counts, field-path bits, field-reader bits, total extractor bits,
  zero-consumption status, and extractor error status.
- Preserved field values and raw payload bytes as non-committed data.
- Created:
  `tools/diagnose-replay-010-pre-recovery-mismatch-field-consumption.mjs`
- Created:
  `tests/pre-recovery-mismatch-field-consumption.test.mjs`

## Result

- Default pass reproduced the original Task 105 failure:
  `Unable to find an entity with index [ 2905 ]`.
- Diagnostic pass reproduced the same first missing entity failure without
  recovery.
- Packet ordinal 953 was found and analyzed.
- Loops 26-29 were the same four Task 111 mismatches.
- Loop 26:
  - entity: 2598
  - class: `CCitadel_Ability_Familiar_HelpingHands`
  - payloadBits: 221
  - actual after-command extractor consumption: 501
  - extra consumption: 280 bits
  - extractor mutations: 7
- Loops 27-29:
  - decoded zero extractor mutations
  - consumed zero extractor bits at the current cursor
  - were not skipped due to missing state
- Payload iterator count aligned with updatedEntries.
- Target-loop read counts remained monotonic.

## Interpretation

The evidence supports:

`field_level_consumption_mismatch_with_following_zero_mutation_updates`

This is field-level/cursor-accounting evidence only. It does not prove:

- Source 2 serializedEntities semantics;
- replay corruption;
- safe direct missing-UPDATE skip;
- a parser fix;
- any canonical or factual match event.

## Outputs

- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/input-identity.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/default-pass-result.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/diagnostic-pass-result.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/target-packet-summary.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/mismatch-loop-analysis.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/extractor-consumption-summary.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/task111-comparison.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/risk-assessment.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/protection-audit.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/field-consumption-gate.json`
- `reports/local-replay-pre-recovery-mismatch-field-consumption.md`

Full verbose diagnostics remain local-only under:

`.local/deadem/cache/local-replay-processing/replay_010/pre-recovery-mismatch-field-consumption/`

## Protections

- Replay 005 was not read, opened, copied, hashed, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were not touched.
- `samples/**` was not used.
- `output/replays/**` was not used.
- No `.dem` file, `.local` file, raw `entityData`, raw
  `serializedEntities`, or field value was committed.
- No canonical package, factual source artifact, snapshot, registry, event,
  spatial output, mechanic effect, combat output, macro output, decision output,
  or ML output was emitted.

## Validation

Required focused tests and workflow validation passed. `npm run check:outputs`
continues to report the known pre-existing oversized
`output/04-controller-pawn-lifecycle.json` warning only.

## Stop

Stop after handoff. Do not create Task 113.
