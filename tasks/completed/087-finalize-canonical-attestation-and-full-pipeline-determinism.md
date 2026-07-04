# Task 087: Finalize Canonical Attestation And Full-Pipeline Determinism

Status: completed

Execution mode: autonomous after explicit authorization

Authorization: granted by user instruction after commit `ea6c145`.

## Objective

Close final integrity gaps in the replay 002 canonical validation pipeline without processing another replay. Implement real audit-manifest verification, full-pipeline determinism, ledger-derived schema coverage, role/path-based IO auditing, and file-specific documentation validation.

## Scope

Use only replay 002 identity hash, existing replay-002 factual artifacts, the historical replay-009 canonical package, small synthetic fixtures, and code/tests/schemas/outputs/documentation required for this correction.

Do not process replays 001, 003, or 004. Do not read, open, hash, or process replay 005. Do not process replays 006-008. Do not select the next replay. Do not apply spatial semantics, mechanic effects, fight, rotation, pressure, macro, or decision analysis.

## Required Outputs

Regenerate `output/replay-002-canonical/` and create `output/replay-002-canonical-v6-validation/`, including `audit-artifact-manifest.json`, `audit-artifact-verification.json`, `schema-comparison-ledger.json`, `validation-matrix.json`, `correction-gate.json`, `final-attestation.json`, and related audit outputs.

Create `reports/replay-002-canonical-factual-state-v6-validation.md`.

## Gate

Success gate: `replay_002_canonical_factual_state_ready_with_constraints_v6`.

Blocked gate: `replay_002_canonical_factual_state_v6_blocked`.

## Follow-up

If v6 passes, create `tasks/blocked/088-select-next-canonical-generalization-control.md`. If blocked, create one Task 088 for the first blocker. Do not execute Task 088.

## Review Note

The v6 gate was not accepted in later technical review. The remaining gaps were: the base manifest was verified before the final canonical files were updated; manifest hashes did not correspond to the final gate and summary; the gate depended only on attestation preconditions; `final-attestation.json` declared `passed: true` instead of relying on an independent verifier; the schema ledger was reconstructed from fixed lists; historical metadata variants were still compared against `{}`; dynamic IO paths were automatically allowed; and internal hashes were masked in the rerun.
