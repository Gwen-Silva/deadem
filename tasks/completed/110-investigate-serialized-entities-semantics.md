# Task 110: Investigate SerializedEntities Proto Semantics And PayloadSizeExtractor Contract

Status: completed

Gate: `local_replay_serialized_entities_semantics_investigated`

## Objective

Investigate local schema/code evidence and bounded replay_010 diagnostics for
`CSVCMsg_PacketEntities.serializedEntities` and `EntityPayloadSizeExtractor`
semantics without parser fixes, recovery changes, canonicalization, or match
facts.

## Inputs

- Authorized replay input:
  `.local/deadem/replays/inbox/partida_010.dem`
- Replay ID: `replay_010`
- Prior bounded diagnostics from Tasks 105-109.
- Local Deadem, CS2, and Dota 2 proto source/compiled schema files.
- Existing engine extractor and packet-entity handler source, inspected only as
  evidence.

## Results

- Local proto sources and compiled proto JSON identify
  `CSVCMsg_PacketEntities.serialized_entities` / `serializedEntities` as
  optional bytes field 13.
- The proto/schema evidence does not document direct payload-size, direct
  after-command skip, or missing-UPDATE recovery semantics.
- `EntityPayloadSizeExtractor` decodes a byte-oriented unsigned varint stream
  from the serialized bytes field; the payload-size/direct skip meaning remains
  local code inference rather than schema proof.
- Task 109 dynamic evidence remains material: loop 21 had `payloadBits` 227
  while after-command consumption was 363 bits, and loop 22 remains
  arithmetic-only because no present entity extractor consumed that entry.
- Missing-UPDATE recovery remains diagnostic-only and must not be promoted to a
  parser fix without external/source-engine semantic evidence or broader
  instrumentation.

## Outputs

- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/input-identity.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/default-pass-result.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/recovery-boundary-result.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/schema-field-inventory.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/extractor-contract-analysis.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/dynamic-payload-semantics-sample.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/semantic-risk-assessment.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/protection-audit.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/semantics-investigation-gate.json`
- `reports/local-replay-serialized-entities-semantics-investigation.md`

## Protections

- Replay 005 was not read, opened, copied, hashed, or processed.
- Replays 006-008 were not processed.
- Candidate replays 011-020 were not touched.
- No files under `samples/` or `output/replays/` were read or written.
- No parser or engine behavior was changed.
- No recovery behavior was added.
- No canonical package, factual events, snapshots, registries, source artifacts,
  spatial output, mechanics output, combat output, macro output, or ML output
  was emitted.
- Task 111 was not created.

## Validation

- `node --test tests/missing-entity-recovery-canary.test.mjs`
- `node --test tests/out-of-range-entity-create-diagnosis.test.mjs`
- `node --test tests/entity-packet-cursor-alignment-diagnosis.test.mjs`
- `node --test tests/serialized-entity-payload-semantics-diagnosis.test.mjs`
- `node --test tests/serialized-entities-semantics-investigation.test.mjs`
- `npm run validate:tasks`
- `npm run lint`
- `npm run check:outputs`
- `npm run codex:validate -- --task 110 --base 633c5591e9841f5f498fd0a502dff05177f53f4a`
- `npm run codex:review -- --task 110 --base 633c5591e9841f5f498fd0a502dff05177f53f4a`

`npm run check:outputs` may continue to report the known pre-existing
`output/04-controller-pawn-lifecycle.json` size warning.

## Stop

No Task 111 was created. Stop for human review and milestone direction.
