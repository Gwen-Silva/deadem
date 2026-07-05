# Project State

Last updated: 2026-07-05

## Authoritative Current State

The current milestone is the five-human-replay factual pilot. The repository is
ready to resume replay work only through the finite Task 094-096 sequence in
`docs/FIVE_REPLAY_PILOT_PLAN.md`.

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

## Rejected Or Historical Results

- Replay 002 Task 089 v8 gate
  `replay_002_canonical_factual_state_ready_with_constraints_v8` is rejected
  after technical review. It is historical evidence only.
- Replay 002 is not accepted yet.
- Tasks 082-089 are preserved as replay-002 validation attempts and review
  history.
- Tasks 090-092 are workflow optimization tasks. They do not accept replay 002.
- `data/replay-manifest.json` is a historical intake inventory, not the current
  pilot definition.
- `output/repository-audit/cleanup-proposal.json` is a historical cleanup
  proposal and is not authorized for execution.

## Current Blocked Work

- Task 094: finalize replay 002 terminal validation v9.
- Task 095: canonicalize replays 001, 003, and 004.
- Task 096: audit the five-human-replay factual pilot.

All three tasks remain blocked until explicitly authorized. Do not create Task
097 automatically.

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
`docs/NEXT_MILESTONE.md` for the active milestone. After Task 096, stop and wait
for a human milestone decision.
