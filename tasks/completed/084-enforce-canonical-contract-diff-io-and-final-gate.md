# Task 084: Enforce Canonical Contract, Schema Diff, IO And Final Gate

Status: completed

Execution mode: autonomous after explicit authorization

Authorization: granted by user instruction after commit `d5b20f2`.

## Objective

Complete the methodological correction of replay 002 canonical factual-state foundation by making the contract, schema diff, provenance audit, IO layer, and final gate executable checks.

Task 083 remains preserved as the second attempt. Its v2 gate was not accepted because factual reads still occurred outside the IO layer, the contract did not validate the whole package, schema diff did not execute real comparisons, provenance audit counted records it did not verify, the gate did not depend on every declared condition, and documentation remained inconsistent.

## Scope

Used only replay 002 identity hashing, existing replay-002 factual artifacts, replay-009 canonical package as historical v1 reference, and code/schemas/tests needed for correction.

Did not process replays 001, 003, or 004. Did not read, open, hash, or process replay 005. Did not process replays 006-008. Did not select the next replay. Did not emit lane, region, proximity, transform, residual, mechanic effect, fight, rotation, pressure, macro, or decision analysis.

## Outputs

Regenerated `output/replay-002-canonical/`.

Created `output/replay-002-canonical-v3-validation/` with contract, manifest, access log, IO audit, raw replay access classification, assumption audit, identity/generation audit, spatial leakage audit, provenance audit, schema validation, schema diff, manifest behavior validation, deterministic rerun, documentation consistency, validation matrix, correction summary, and correction gate.

Created `reports/replay-002-canonical-factual-state-v3-validation.md`.

## Gate

Success gate: `replay_002_canonical_factual_state_ready_with_constraints_v3`.

The gate means replay 002 is represented by the corrected canonical factual-state contract as one bounded external control case. It does not prove full corpus generalization and does not authorize replay 005.

## Follow-Up

Created `tasks/blocked/085-select-next-canonical-generalization-control.md`.
