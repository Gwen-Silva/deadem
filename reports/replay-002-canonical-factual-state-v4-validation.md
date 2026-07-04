# Replay 002 Canonical Factual State V4 Validation

## Gate

`replay_002_canonical_factual_state_ready_with_constraints_v4`

Task 085 completes the corrective pass after Task 084's v3 gate was rejected in technical review. Tasks 082 and 083 remain preserved as earlier attempts; Task 084 is preserved as the v3 attempt that exposed the remaining need for nested contract coverage, event-variant diff coverage, manifest behavior enforcement, capability provenance, direct-observation justification, and calculated audit gates.

## Executable Contract

The canonical contract is sourced from `lib/canonical-state/contract.mjs` and emitted to `schemas/canonical-factual-state-contract.v2.json` plus `output/replay-002-canonical-v4-validation/canonical-contract.json`. Validation covers nested registries, event variants, metadata variants, overlays, snapshots, capability matrix, validation summary, and canonical gate.

## Raw Replay Access

Approach: `raw_replay_identity_hash_verified`.

The replay file is hashed only for identity. Parser completion is imported from the parser compatibility matrix with provenance; the parser is not executed by Task 085.

## Results

- Players: 12
- Entities: 47
- Factual events: 3476
- Snapshots: 1835
- Schema valid: true
- Target schema breaks: 0
- Generic schemas remaining: 0 objects / 0 arrays
- Deterministic rerun: true
- Mechanic effects applied: 0

## Provenance And Gate

The v4 package validates 12 player records, 47 entity records, 3476 factual events, 1835 snapshots, metadata, capabilities, validation summary, and canonical gate. Capability provenance and direct-observation justification are audited separately; direct parser observations are zero because replay-002 consumed reconciled artifacts rather than raw parser-side field chains.

## Remaining Constraints

Decoded entity indices, entity serials, objective entity generations, pawn generations, independent visual validation, spatial semantics, mechanic effects, combat grouping, rotations, pressure, macro, and decision analysis remain unavailable or blocked. Replay 005 remains protected.
