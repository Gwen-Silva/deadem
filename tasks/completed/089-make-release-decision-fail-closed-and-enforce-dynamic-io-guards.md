# Task 089: Make Release Decision Fail-Closed And Enforce Dynamic IO Guards

Status: completed

Execution mode: autonomous after explicit authorization

Authorization: granted by user instruction after commit `eed74c1`.

## Objective

Correct the remaining Task 088 blockers without processing another replay. The task must separate evidence-only pipeline runs from release runs, make `release-decision.json` authoritative over all published gates, enforce real runtime guards for dynamic IO paths, write the final report only after final results are known, and add executable negative tests for the verifiers.

## Scope

Use only replay 002 identity hash, existing replay-002 factual artifacts, the historical replay-009 canonical package, small synthetic fixtures, and correction code/tests/outputs/documentation.

Do not process replays 001, 003, or 004. Do not read, open, hash, or process replay 005. Do not process replays 006-008. Do not select another replay. Do not apply lane, region, proximity, transform, residual, mechanics, fight, rotation, pressure, macro, or decision analysis.

## Outputs

Regenerate `output/replay-002-canonical/` and create `output/replay-002-canonical-v8-validation/`, including evidence matrix, deterministic rerun, evidence/base attestation outputs, release decision, release consistency verification, release envelope and verification, correction gate, correction summary, and related audit outputs.

Create `reports/replay-002-canonical-factual-state-v8-validation.md`.

## Gate

Success gate: `replay_002_canonical_factual_state_ready_with_constraints_v8`.

Blocked gate: `replay_002_canonical_factual_state_v8_blocked`.

## Follow-up

If v8 passes, create `tasks/blocked/090-select-next-canonical-generalization-control.md`. If blocked, create exactly one Task 090 for the first blocker. Do not execute Task 090.

## Review Note

The v8 gate was rejected after review. The remaining technical correction was transferred to Task 091, while Task 090 was reserved for Codex workflow optimization. Do not treat Task 089 as an accepted canonical gate.
