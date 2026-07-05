# Task 108: Diagnose Entity Packet Cursor Alignment Before Replay 010 Out-Of-Range CREATE

Status: completed

Gate: `local_replay_entity_packet_cursor_alignment_diagnosed`

Commit: not recorded in task file

## Objective

Diagnose whether the Task 107 `entity index out of range` CREATE boundary is
preceded by `CSVCMsg_PacketEntities.entityData` cursor misalignment, especially
across the recovered missing UPDATE at loop 22 and the out-of-range CREATE at
loop 23.

## Result

Default behavior still reproduced the Task 105 missing-entity failure. Opt-in
recovery still advanced past 953 ticks and reached the Task 107 boundary at
current tick 2862.

The compact packet ledger captured loops 18-23. The key transition was:

- loop 22: UPDATE for entity 6679, missing from the registry;
- loop 22 payloadBits: 266;
- loop 22 action: `skipped_missing_update_payload`;
- loop 22 after command read count: 5958;
- loop 22 after action read count: 6224;
- loop 23 start read count: 6224;
- loop 23 operation: CREATE;
- loop 23 accumulated entity index: 570655505.

The current skip model is internally consistent for loop 22:

`5958 + 266 = 6224`

However, bounded local simulation around the observed loop 23 start found
nearby offsets that decode plausible entity index/command pairs. For example,
offset -2 bits decodes to CREATE entity 7694, and offset +8 bits decodes to
UPDATE entity 7547. This keeps cursor misalignment as a viable hypothesis.

## Epistemic Boundary

Observed facts:

- the current skip arithmetic from loop 22 to loop 23 is internally consistent;
- loop 23 starts at read count 6224 under the current model;
- loop 23 decodes to an out-of-range CREATE under that start;
- no entity was registered and no fields were materialized at the boundary.

Simulation results:

- alternative offsets near the loop 23 start can decode plausible entity
  index/command pairs;
- those simulated offsets were not used to recover or continue the parser.

Hypotheses:

- cursor alignment may be wrong before loop 23;
- `serializedEntities` payload size may not be sufficient by itself to safely
  skip this missing UPDATE.

Not determined:

- whether loop 22 caused the boundary;
- whether misalignment began before loop 22;
- whether replay data, parser assumptions, or recovery skip semantics are the
  root cause.

## Outputs

- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/input-identity.json`
- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/default-pass-result.json`
- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/recovery-boundary-result.json`
- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/entity-packet-ledger-summary.json`
- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/cursor-model-comparison.json`
- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/protection-audit.json`
- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/cursor-alignment-gate.json`
- `reports/local-replay-entity-packet-cursor-alignment.md`

The full packet ledger remains local-only under
`.local/deadem/cache/local-replay-processing/replay_010/entity-packet-cursor-alignment/`
with hash metadata in the committed ledger summary.

## Protections

- Replay 005 was not read, opened, copied, hashed, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were rejected by input validation.
- No `samples/` or `output/replays/` path was used.
- No raw replay bytes, packet payload bytes, `entityData`, or
  `serializedEntities` bytes were committed.
- No canonical package, factual source artifact, snapshot, registry, spatial
  field, mechanic effect, fight, macro, decision, or ML artifact was emitted.
- Task 109 was not created.

## Validation

- `node tools/diagnose-replay-010-entity-packet-cursor-alignment.mjs ...`
- `node --test tests/missing-entity-recovery-canary.test.mjs`
- `node --test tests/out-of-range-entity-create-diagnosis.test.mjs`
- `node --test tests/entity-packet-cursor-alignment-diagnosis.test.mjs`
- `npm run validate:tasks`
- `npm run lint`
- `npm run check:outputs`
- `npm run codex:validate`
- `npm run codex:review`
