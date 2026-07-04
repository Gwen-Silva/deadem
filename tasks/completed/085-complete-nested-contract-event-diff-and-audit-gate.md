# Task 085: Complete Nested Contract, Event Diff And Audit Gate

Status: completed

Execution mode: autonomous after explicit authorization

Authorization: granted by user instruction after commit `f4768ce`.

## Objective

Correct the remaining methodological gaps from Task 084 without processing another replay. Complete the canonical contract down to internal fields, include all factual-event variants in schema comparisons, apply manifest behavior, audit provenance for all assertions, replace positive hard-coded audit results with executable verifiers, and emit the final gate only from calculated audits.

## Scope

Use only replay 002 identity hash, existing replay-002 factual artifacts, replay-009 historical canonical package, small synthetic fixtures, and code/tests/schemas/documentation required for this correction.

Do not process replays 001, 003, or 004. Do not read, open, hash, or process replay 005. Do not process replays 006-008. Do not select the next replay. Do not apply spatial semantics, mechanics, fights, rotations, pressure, macro, or decision analysis.

## Required Outputs

Regenerate `output/replay-002-canonical/`.

Create `output/replay-002-canonical-v4-validation/` with:

- `canonical-contract.json`
- `contract-completeness-audit.json`
- `contract-source-consistency.json`
- `input-manifest.json`
- `input-access-log.json`
- `io-policy-audit.json`
- `raw-replay-access-classification.json`
- `assumption-audit.json`
- `identity-and-generation-audit.json`
- `spatial-leakage-audit.json`
- `provenance-audit.json`
- `direct-observation-justification.json`
- `canonical-schema-validation.json`
- `canonical-schema-diff.json`
- `schema-diff-coverage.json`
- `manifest-behavior-validation.json`
- `deterministic-rerun.json`
- `documentation-consistency.json`
- `protections-audit.json`
- `validation-matrix.json`
- `correction-summary.json`
- `correction-gate.json`

Create `reports/replay-002-canonical-factual-state-v4-validation.md`.

## Gate

Success gate: `replay_002_canonical_factual_state_ready_with_constraints_v4`.

Use only if the nested contract is complete, generic schemas are zero, all event variants are compared, capability provenance is validated, direct observations are justified, manifest behavior is applied, audits are calculated, deterministic rerun passes, protections pass, and documentation is consistent.

Blocked gate: `replay_002_canonical_factual_state_v4_blocked`.

## Follow-Up

If v4 passes, create `tasks/blocked/086-select-next-canonical-generalization-control.md`.

If blocked, create exactly one Task 086 for the first blocker. Do not execute Task 086.
