# Task 107: Diagnose Opt-In Recovery Out-Of-Range Entity Create Boundary

Status: completed

Gate: `local_replay_out_of_range_entity_create_boundary_diagnosed`

Commit: not recorded in task file

## Objective

Diagnose the `entity index out of range` boundary reached by the Task 106
opt-in recovery pass for the authorized local replay canary
`.local/deadem/replays/inbox/partida_010.dem`.

## Result

Default behavior still reproduced the Task 105 failure:
`Unable to find an entity with index [ 2905 ]`.

With opt-in missing-entity recovery plus opt-in diagnostic recording, replay
advancement passed the 953-tick Task 105 boundary and reached the later
`entity index out of range` failure at current tick 2862.

The failing entry was a CREATE operation:

- updated entries: 42
- loop: 23
- accumulated entity index: 570655505
- class ID: 139
- serial: 35052
- class ID size bits: 10
- payload bits: 22
- class: `CCitadel_Ability_Frank_ShockTarget2`

The failure occurred during Entity construction, after class lookup and before
baseline lookup, `registerEntity`, or field extraction.

## Epistemic Boundary

Observed facts:

- class ID and serial were read before the boundary;
- class lookup completed;
- Entity construction failed;
- baseline lookup was not attempted;
- entity registration was not attempted;
- field extraction was not attempted;
- recovery did not attempt to recover this CREATE boundary.

Hypothesis:

- the accumulated entity index exceeded the engine entity-index range before
  baseline lookup.

Not determined:

- whether the index delta stream was already misaligned before this entry;
- whether earlier skipped missing-entity updates contributed to later cursor
  divergence;
- whether replay_010 requires parser support beyond missing-entity reference
  recovery.

## Outputs

- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/input-identity.json`
- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/default-pass-result.json`
- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/recovery-pass-boundary-result.json`
- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/out-of-range-boundary-diagnostic.json`
- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/recovery-warning-tail-summary.json`
- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/protection-audit.json`
- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/diagnosis-gate.json`
- `reports/local-replay-out-of-range-entity-create-diagnosis.md`

The full recovery-warning log remains local-only under
`.local/deadem/cache/local-replay-processing/replay_010/out-of-range-entity-create-diagnosis/`
with hash metadata in the committed warning-tail summary.

## Protections

- Replay 005 was not read, opened, copied, hashed, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were rejected by input validation.
- No `samples/` or `output/replays/` path was used.
- No replay bytes were committed.
- No canonical package, factual source artifact, snapshot, registry, spatial
  field, mechanic effect, fight, macro, decision, or ML artifact was emitted.
- Task 108 was not created.

## Validation

- `node --test tests/missing-entity-recovery-canary.test.mjs`
- `node --test tests/out-of-range-entity-create-diagnosis.test.mjs`
- Authorized replay_010 diagnosis command
- `npm run validate:tasks`
- `npm run lint`
- `npm run check:outputs`
- `npm run codex:validate`
- `npm run codex:review`
