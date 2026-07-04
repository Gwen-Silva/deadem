# Task 083: Correct Replay 002 Canonical Generalization Foundation

Status: completed

Execution mode: autonomous after explicit authorization

Authorization: granted by user instruction after commit `f0243ce`.

## Objective

Correct methodological issues from Task 082 and produce a generic, provenance-preserving, auditable canonical factual-state foundation for replay 002.

Task 082 remains historical as a first attempt. Do not rewrite that commit or hide the issues; add a review note to the completed Task 082 file stating that its original gate was not accepted and this correction is handled by Task 083.

## Scope

Use only replay 002 as the execution case, replay 009 canonical artifacts as contract reference, and existing code/schemas/reports needed for correction.

Do not process replays 001, 003, or 004. Do not read, open, hash, or process replay 005. Do not process replays 006-008. Do not select the next replay in this task.

## Required Corrections

- Extract a generic core builder with no replay-002 or replay-009 constants in the core.
- Keep a replay-002 CLI/manifest wrapper, but the core must receive replay ID, raw replay path, source manifest, output directories, expected gate, enabled categories, optional overlays, provenance/hash policy, and blocked fields/categories explicitly.
- Classify raw replay access honestly. If generating from existing artifacts, use `raw_replay_identity_hash_verified`, not `raw_replay_processed`.
- Centralize all input reads and hashes behind an allowlisted IO layer that blocks replay 005 and replays 006-008, including replay 006 explicitly.
- Use epistemic types: `direct_parser_observation`, `deterministic_derivation`, `human_annotation`, `independent_visual_validation`, `heuristic`, `unresolved`.
- Mark sums/differences, inferred respawns, canonical IDs, event-type sanitization, snapshots, objective candidate classification, and lifecycle-to-canonical category transforms as deterministic derivations.
- Preserve raw handle, entity index, entity serial, entity generation, generation status, and generation evidence separately. Do not decode `handles[0]` as entity index without evidence. Do not fabricate generations.
- Remove spatial leakage from canonical keys, fields, and promoted strings. Legacy spatial source identifiers may remain only in provenance with `legacySourceIdentifier: true`.
- Define a versioned canonical contract outside replay directories and validate all records against it.
- Produce schema diff against the contract, replay 009, replay 002, every factual-event variant, snapshots, registries, metadata, capability matrix, and overlays.
- Rebuild assumption audit categories and focused tests so tests recompute evidence rather than trusting generator flags.

## Outputs

Write corrected replay package to `output/replay-002-canonical/`.

Write correction assessment to `output/replay-002-canonical-correction/` with at minimum:

- `canonical-contract.json`
- `input-manifest.json`
- `input-access-log.json`
- `raw-replay-access-classification.json`
- `assumption-audit.json`
- `identity-and-generation-audit.json`
- `spatial-leakage-audit.json`
- `provenance-audit.json`
- `canonical-schema-validation.json`
- `canonical-schema-diff.json`
- `deterministic-rerun.json`
- `correction-summary.json`
- `correction-gate.json`

Create `reports/replay-002-canonical-factual-state-correction.md`.

## Gate

Success gate: `replay_002_canonical_factual_state_ready_with_constraints_v2`.

Use only if the core builder is genuinely parameterized; provenance distinguishes facts and derivations; handle/index/generation are separated; no generation is fabricated; no spatial leakage exists; all records validate against the contract; schema diff covers all categories; protections are enforced by the IO layer; deterministic rerun passes; and documentation is consistent.

Blocked gate: `replay_002_canonical_factual_state_correction_blocked`.

Use if any correction requires unavailable generation, identity, or source evidence. Do not fabricate fields to reach success.

## Follow-Up

If the v2 gate passes, create `tasks/blocked/084-select-next-canonical-generalization-control.md`. It may select the next human replay only after new review. Do not execute Task 084.

If blocked, create exactly one Task 084 for the first factual blocker.

## Validation

Run focused Task 083 tests, full schema validation, category audit, synthetic parameterization tests, allowlist tests, deterministic rerun, JSON/JSONL validation, ESLint, related engine tests, task queue validation, Markdown links, output-size guard, and final git status.

The pre-existing `output/04-controller-pawn-lifecycle.json` output-size warning remains unrelated; do not modify it artificially.

## Post-Completion Technical Review Note

Task 083 is preserved as the second corrective attempt, but its v2 gate was not accepted after Task 084 review. The v2 result still allowed factual reads outside the centralized IO layer, did not validate the complete canonical package against the contract, did not execute a real schema comparison for every required package surface, counted provenance records without checking every corresponding record, let the gate omit declared validation conditions, and left project documentation inconsistent about readiness. Task 084 supersedes the v2 gate with an executable v3 contract, schema diff, provenance audit, IO audit, deterministic rerun, and final validation matrix.
