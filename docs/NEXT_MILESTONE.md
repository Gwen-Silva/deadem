# Next Milestone: Five-Human-Replay Factual Pilot

## Current State

The accepted Codex workflow gate is
`codex_task_workflow_optimization_ready_v3`. Its documented limitations in
`reports/codex-workflow-optimization-v3.md` are accepted operational
limitations for the five-replay pilot.

Replay 009 remains the accepted canonical factual-state package with
constraints. Replay 002 terminal validation v9 is ready with constraints after
Task 094. Replays 001, 003, and 004 are canonicalized with compact package
manifests after Task 095. Task 096 audited the five-human-replay factual pilot
as ready for a bounded human milestone decision. Task 097 defined the storage
and cache strategy before scaling. Task 098 attempted expansion toward a
15-human-replay factual batch using existing generated artifacts only and
blocked because only five accepted pilot replays were eligible. Task 089's v8
gate remains a rejected historical attempt.

Spatial work remains parked under the Task 081 resume contract. Replay 005 is
protected. Replays 006-008 remain unsupported bot fixtures. Macro, fights,
rotations, pressure, mechanic effects, ML, and decision analysis remain
unavailable.

## Source Hierarchy

Use `docs/PROJECT_STATE.md` for the authoritative narrative current state, this
file for the active milestone and finite execution horizon,
`docs/codex/CURRENT_STATE.md` for compact Codex state, and
`tasks/specs/<id>.json` for executable scope. Reports, task files, and outputs
are historical evidence unless current state documents accept them.

## Five-Replay Pilot

The current pilot is defined by `data/five-human-replay-pilot.json`.

Included human replays:

- `replay_001`
- `replay_002`
- `replay_003`
- `replay_004`
- `replay_009`

Excluded replays:

- `replay_005`: protected final holdout
- `replay_006`: unsupported bot fixture
- `replay_007`: unsupported bot fixture
- `replay_008`: unsupported bot fixture

The historical `data/replay-manifest.json` remains an intake inventory, not the
current pilot definition.

## Finite Execution Horizon

Tasks 094, 095, 096, and the explicitly authorized post-pilot storage strategy
Task 097 are complete. Task 098 is also complete as an explicitly authorized
post-pilot expansion attempt with the blocked gate
`factual_batch_15_expansion_blocked`. Task 099 is complete as an explicitly
authorized intake-preparation task with the gate
`human_replay_intake_ready_for_user_files`.

Do not create Task 100 automatically. Stop and wait for user replay files or a
human milestone decision.

## Task 094

Purpose: resolve only the four frozen replay-002 terminal blockers:

- terminal manifest freshness
- evidence-only determinism representation
- strict scope containment
- intraprocedural and order-aware IO guard analysis

Success gate: `replay_002_canonical_factual_state_ready_with_constraints_v9`.

Blocked gate: `replay_002_canonical_factual_state_v9_blocked`.

Status: completed with the success gate above.

## Task 095

Purpose: use the existing canonical core to canonicalize the remaining human
pilot controls, `replay_001`, `replay_003`, and `replay_004`, without
replay-specific branches.

Success gate: `remaining_human_controls_canonicalized`.

Blocked gate: `remaining_human_controls_canonicalization_blocked`.

Status: completed with the success gate above.

## Task 096

Purpose: audit the five-human-replay factual pilot across replays 001, 002,
003, 004, and 009 for schema compatibility, provenance, failures, processing
duration, memory, storage, caching, and readiness to expand to 15 replays.

Success gate: `five_human_replay_factual_pilot_ready`.

Blocked gate: `five_human_replay_factual_pilot_blocked`.

Status: completed with the success gate above. The result is a bounded factual
foundation, not full corpus generalization.

## Task 097

Purpose: define storage, cache, regeneration, compact-manifest, large-output,
and scaling-estimate policy before expanding beyond the five-replay pilot.

Success gate: `storage_cache_strategy_ready_for_scaling_decision`.

Blocked gate: `storage_cache_strategy_blocked`.

Status: completed with the success gate above. No replay was processed and no
output migration was performed.

## Task 098

Purpose: attempt to expand the factual batch toward 15 human replays using
existing generated artifacts only, without raw replay processing.

Success gate: `factual_batch_15_ready`.

Blocked gate: `factual_batch_15_expansion_blocked`.

Status: completed with the blocked gate above. The repository currently exposes
only five eligible accepted human replay entries, so ten more eligible generated
human replay entries are needed before a 15-replay batch can be formed.

## Task 099

Purpose: prepare a safe local intake process for future human replay candidates
without reading, hashing, copying, parsing, or processing replay files.

Success gate: `human_replay_intake_ready_for_user_files`.

Blocked gate: `human_replay_intake_blocked`.

Status: completed with the success gate above. The local inbox may be absent;
the user can create `.local/deadem/replays/inbox/` and add candidate replay
filenames plus metadata entries for a future explicitly authorized processing
task.

## Non-Goals

- Do not inspect or process replay 005.
- Do not process bot fixtures 006-008.
- Do not start spatial, mechanic-effect, ML, macro, fight, rotation, pressure,
  role, or decision analysis.
- Do not treat replay 002 v8 as accepted.
- Do not create another workflow, cleanup, documentation, or repository
  refactoring task before the pilot finishes.
