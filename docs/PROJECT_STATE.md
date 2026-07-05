# Project State

Last updated: 2026-07-05

## Authoritative Current State

The current milestone is the five-human-replay factual pilot. Task 094
completed replay-002 terminal validation v9, Task 095 canonicalized the
remaining human controls 001, 003, and 004 with compact package manifests, and
Task 096 audited the five-human-replay factual pilot. The pilot is ready as a
bounded factual foundation for a human milestone decision under
`five_human_replay_factual_pilot_ready`. Task 097 defined the storage and cache
strategy needed before scaling under
`storage_cache_strategy_ready_for_scaling_decision`. Task 098 attempted the
explicitly authorized expansion toward a 15-human-replay factual batch using
existing generated artifacts only and blocked under
`factual_batch_15_expansion_blocked`: only the five accepted pilot replays were
eligible, so ten additional eligible generated human replay entries are still
needed. Task 099 prepared a safe local intake path for future human replay
candidates under `human_replay_intake_ready_for_user_files`; it did not process
or hash any replay and did not create Task 100.

The accepted Codex workflow gate is
`codex_task_workflow_optimization_ready_v3`. The limitations documented in
`reports/codex-workflow-optimization-v3.md` are accepted operational
limitations for this pilot. Do not implement workflow v4 before Task 096 unless
an observed critical failure occurs: protected replay access, undetected
out-of-scope modification, success gate despite a required check failure, or
repository data loss/corruption.

## Current Source Hierarchy

1. `docs/PROJECT_STATE.md`: authoritative narrative current state and
   accepted/rejected gates.
2. `docs/NEXT_MILESTONE.md`: authoritative current milestone and finite
   execution horizon.
3. `docs/codex/CURRENT_STATE.md`: compact Codex-readable state.
4. `tasks/specs/<id>.json`: executable scope for an authorized task.
5. Task files and reports: historical implementation and review records.
6. Output artifacts: evidence and generated results, not automatic project
   acceptance.

Historical reports or outputs cannot override this file or
`docs/NEXT_MILESTONE.md`.

## Accepted Foundations

- Replay 009 canonical factual state remains accepted with constraints under
  `replay_009_canonical_factual_state_ready_with_constraints`.
- Replay 009 inspector workflows remain validated with gaps under
  `replay_009_inspector_workflows_validated_with_gaps`.
- Normal human replays currently in the pilot scope are `replay_001`,
  `replay_002`, `replay_003`, `replay_004`, and `replay_009`.
- The five-replay pilot definition is `data/five-human-replay-pilot.json`.
- Replays 001, 003, and 004 are canonicalized under Task 095 with compact
  manifests and full in-memory contract validation under
  `remaining_human_controls_canonicalized`.

## Rejected Or Historical Results

- Replay 002 Task 089 v8 gate
  `replay_002_canonical_factual_state_ready_with_constraints_v8` is rejected
  after technical review. It is historical evidence only.
- Replay 002 terminal validation v9 is ready with constraints under
  `replay_002_canonical_factual_state_ready_with_constraints_v9`.
- Tasks 082-089 are preserved as replay-002 validation attempts and review
  history.
- Tasks 090-092 are workflow optimization tasks. They do not accept replay 002.
- `data/replay-manifest.json` is a historical intake inventory, not the current
  pilot definition.
- `output/repository-audit/cleanup-proposal.json` is a historical cleanup
  proposal and is not authorized for execution.

## Current Human Decision Point

The finite Task 094-096 pilot horizon is complete. Do not create Task 097
automatically; Task 097 has now completed as an explicitly authorized
post-pilot planning task. Task 098 has now completed as an explicitly
authorized expansion attempt, and Task 099 has prepared human replay intake for
future candidates without creating Task 100. Stop for a human milestone
decision about whether to place additional human replay candidates in the local
intake inbox, authorize future raw replay processing, improve cache tooling,
revisit spatial evidence only with genuinely new evidence, improve
mechanics/build mapping, or defer toward local AI/runtime benchmarking later.

## Protected And Unsupported Replays

- `replay_005` is the protected final holdout. Do not read, hash, copy, open, or
  process it outside an explicitly authorized final-holdout task.
- `replay_006`, `replay_007`, and `replay_008` are unsupported bot fixtures.
  Do not process them in the five-human-replay pilot.

## Parked Work

Spatial work remains parked under the Task 081 resume contract. Replay-009
transform work may resume only with genuinely new, replay-compatible,
non-circular evidence such as compatible client/build evidence, exact
replay-to-map identifiers, unique debug capture, identity-bearing entity-lump
metadata, or independently identified fixed-anchor sets.

Macro interpretation, fights, rotations, pressure, mechanic effects, ML,
decision-quality analysis, objective completion inference, lane/region
semantics, and proximity analysis remain unavailable.

## Current Direction

Use `docs/FIVE_REPLAY_PILOT_PLAN.md` for the finite pilot plan and
`docs/NEXT_MILESTONE.md` for the active milestone. Task 099 is complete with a
safe intake gate; stop and wait for user replay files or a human milestone
decision.
