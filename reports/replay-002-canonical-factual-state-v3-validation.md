# Replay 002 Canonical Factual State V3 Validation

## Gate

`replay_002_canonical_factual_state_ready_with_constraints_v3`

Task 084 completes the methodological correction started by Tasks 082 and 083. Task 082 was preserved as a first attempt. Task 083 was preserved as a second attempt, but its v2 gate was not accepted because factual reads still occurred outside the IO layer, the contract did not validate the whole package, schema diff did not execute real comparisons, provenance audit counted records it did not verify, the gate did not depend on all declared conditions, and documentation remained inconsistent.

## Executable Contract

The canonical contract is sourced from `lib/canonical-state/contract.mjs` and emitted to `schemas/canonical-factual-state-contract.v2.json` plus `output/replay-002-canonical-v3-validation/canonical-contract.json`. Validation covers player registry, entity registry, every factual-event variant, non-timeline metadata, independent-validation overlay, snapshots, capability matrix, validation summary, and canonical gate.

Validated records: 5,381 total. By artifact: players 12, entities 47, factual events 3,476, metadata 3, overlays 0, snapshots 1,835, capability entries 6, validation summary 1, canonical gate 1.

Validated event variants: player identity 12, player death 56, observed respawn 50, inferred return 4, team net worth 1,835, entity present 47, raw health changed 1,361, raw health zero/terminal observed 26, raw state changed 38, entity deleted/absent observed 47.

## Schema Diff

The schema diff now runs three comparisons:

- replay 002 v3 target package versus contract v3: 0 target schema breaks.
- replay 009 v1 reference versus contract v3: 36 expected version/migration differences.
- replay 009 v1 reference versus replay 002 v3: 102 documented differences, including identity-model and validation-coverage differences.

Replay 009 remains a historical v1 reference and is not required to pass the v3 contract without migration.

## Provenance And IO

Provenance audit checked players 12/12, entities 47/47, events 3,476/3,476, snapshots 1,835/1,835, metadata 3/3, overlays 0/0, and capability entries 6/6. The 62 direct-parser-observation records were reviewed under the v3 classification rules.

All factual input reads and raw-replay identity hashing go through `lib/canonical-state/io-layer.mjs`. The raw replay is accessed only as `raw_replay_identity_hash_verified`; Task 084 does not parse replay bytes or extract telemetry. Protected replay 005 and bot fixtures 006-008 were not accessed.

## Final Matrix

The final gate depends on contract validation, schema diff execution, zero target schema breaks, provenance audit, identity audit, spatial leakage audit, IO audit, deterministic rerun, documentation consistency, manifest behavior, and replay protections. All conditions passed after the deterministic rerun.

## Remaining Constraints

This gate means replay 002 is represented by the corrected canonical factual-state contract with one bounded external control case. It does not prove full corpus generalization and does not authorize replay 005. Decoded entity indexes, entity serials, objective entity generations, pawn generations, independent visual validation, spatial semantics, mechanic effects, combat grouping, rotations, pressure, macro, and decision analysis remain unavailable or blocked.
