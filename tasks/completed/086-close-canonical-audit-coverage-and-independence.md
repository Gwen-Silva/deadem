# Task 086: Close Canonical Audit Coverage And Independence

Status: completed

Execution mode: autonomous after explicit authorization

Authorization: granted by user instruction after commit `0194302`.

## Objective

Correct final audit coverage and independence gaps in the replay 002 canonical factual-state layer without processing another replay. Audit epistemic types across all artifacts, correct remaining direct classifications, compare the complete historical replay 009 package against the v5 contract, make IO/documentation/contract-source consistency real independent verifiers, and emit the final gate only from reproducible audit artifacts.

## Scope

Use only replay 002 identity hash, existing replay-002 factual artifacts, the historical replay-009 canonical package, small synthetic fixtures, and code/tests/schemas/documentation required for this correction.

Do not process replays 001, 003, or 004. Do not read, open, hash, or process replay 005. Do not process replays 006-008. Do not select the next control. Do not apply lane, region, proximity, transform, residual, mechanics, fights, rotations, pressure, macro, or decision analysis.

## Required Outputs

Regenerate `output/replay-002-canonical/`.

Create `output/replay-002-canonical-v5-validation/` with the v5 audit package, including epistemic classification, direct-observation, complete schema diff coverage, static IO audit, deep contract-source consistency, documentation consistency, audit artifact manifest, validation matrix, correction summary, and correction gate.

Create `reports/replay-002-canonical-factual-state-v5-validation.md`.

## Gate

Success gate: `replay_002_canonical_factual_state_ready_with_constraints_v5`.

Blocked gate: `replay_002_canonical_factual_state_v5_blocked`.

## Follow-Up

If v5 passes, create `tasks/blocked/087-select-next-canonical-generalization-control.md`.

If blocked, create exactly one Task 087 for the first blocker. Do not execute Task 087.

## Review Note

The v5 gate was preserved but not accepted after later review. Task 087
supersedes it because the audit-artifact manifest was marked as passed without
verifying each entry, files could be modified after manifest creation, the
deterministic rerun compared provisional outputs from before the independent
auditors, schema-diff coverage still used manual lists, historical metadata
variants were compared against `{}`, and the IO audit permitted reads based on
module directory instead of an explicit role/path policy.
