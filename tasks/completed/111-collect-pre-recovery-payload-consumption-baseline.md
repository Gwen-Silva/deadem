# Task 111: Collect Pre-Recovery SerializedEntities Consumption Baseline For Replay 010

Status: completed

Gate: `local_replay_pre_recovery_payload_consumption_baseline_ready`

## Objective

Collect a compact dynamic baseline for
`CSVCMsg_PacketEntities.serializedEntities` payload-size consumption in the
default path before the original Task 105 missing-entity failure.

This was a diagnostic baseline only. It did not fix the parser, add recovery,
promote missing-UPDATE skips, construct a canonical package, or emit match
facts.

## Inputs

- Authorized local replay input:
  `.local/deadem/replays/inbox/partida_010.dem`
- Replay ID: `replay_010`
- Prior bounded diagnostics from Tasks 105-110.

## Implementation

- Added disabled-by-default, opt-in pre-recovery payload-consumption
  diagnostics behind `ParserConfiguration` recovery diagnostics.
- The diagnostic option does not enable unresolved-entity recovery, missing
  class-baseline recovery, out-of-range CREATE recovery, entity registration,
  placeholder entities, or field materialization.
- The diagnostic pass reproduced the same Task 105 missing-entity failure and
  failed closed.
- Full per-packet diagnostics were written only under `.local/`; committed
  outputs contain compact summaries, counts, samples, and hashes.

## Result

- Default pass reproduced: `Unable to find an entity with index [ 2905 ]`.
- Diagnostic pass reproduced the same failure without recovery.
- Packets summarized before the failure: 954.
- Present UPDATE entries compared before the failure: 1,940.
- Exact after-command matches: 1,936.
- Mismatches before any recovery: 4.
- Mismatch rate: 0.002061855670103093.
- Largest absolute delta: 280 bits.
- Task 109 comparison: the pre-recovery baseline sustains the Task 109 loop 21
  mismatch as not solely post-recovery contamination.
- Direct missing-UPDATE skip remains unsafe and diagnostic-only.

## Outputs

- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/input-identity.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/default-pass-result.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/diagnostic-pass-result.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/pre-recovery-packet-summary.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/present-update-consistency-summary.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/first-missing-entity-boundary.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/task109-comparison.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/baseline-risk-assessment.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/protection-audit.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/baseline-gate.json`
- `reports/local-replay-pre-recovery-payload-consumption-baseline.md`

## Protections

- Replay 005 was not read, opened, copied, hashed, or processed.
- Replays 006-008 were not processed.
- Candidate replays 011-020 were not touched.
- `samples/**` and `output/replays/**` were not used.
- No `.dem` or `.local` files were committed.
- No raw `entityData`, raw `serializedEntities`, or field values were
  committed.
- No canonical package, source artifacts, snapshots, registries, factual
  events, spatial output, mechanics output, combat output, macro output,
  decision output, or ML output was emitted.
- Task 112 was not created.

## Validation

- `node tools/collect-replay-010-pre-recovery-payload-consumption-baseline.mjs --input .local/deadem/replays/inbox/partida_010.dem --replay-id replay_010 --local-output .local/deadem/cache/local-replay-processing/replay_010/pre-recovery-payload-consumption-baseline/ --summary-output output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/`
- `node --test tests/missing-entity-recovery-canary.test.mjs`
- `node --test tests/out-of-range-entity-create-diagnosis.test.mjs`
- `node --test tests/entity-packet-cursor-alignment-diagnosis.test.mjs`
- `node --test tests/serialized-entity-payload-semantics-diagnosis.test.mjs`
- `node --test tests/serialized-entities-semantics-investigation.test.mjs`
- `node --test tests/pre-recovery-payload-consumption-baseline.test.mjs`
- `npm run validate:tasks`
- `npm run lint`
- `npm run check:outputs`
- `npm run codex:validate -- --task 111 --base c22142a74bb01a373bc59cb0faea4cb65c4c7ca7`
- `npm run codex:review -- --task 111 --base c22142a74bb01a373bc59cb0faea4cb65c4c7ca7`

`npm run check:outputs` may continue to report the known pre-existing
`output/04-controller-pawn-lifecycle.json` size warning.

## Stop

No Task 112 was created. Stop for human review and milestone direction.
