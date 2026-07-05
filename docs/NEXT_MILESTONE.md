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
`human_replay_intake_ready_for_user_files`. Task 100 is complete as an
explicitly authorized local inbox normalization task with the gate
`human_replay_inbox_normalized`. Task 101 is complete as an explicitly
authorized local candidate processing attempt with the blocked gate
`factual_batch_15_candidate_processing_blocked`. Task 102 is complete as an
explicitly authorized single-replay local-input canary with the partial gate
`generic_local_replay_source_artifacts_ready_canonicalization_pending`. Task
  103 is complete as an explicitly authorized source-artifact attempt for only
`partida_010.dem` with the blocked gate
`generic_local_replay_canonical_source_artifacts_blocked`. Task 104 is complete
as an explicitly authorized forward-only source-artifact canary for the same
single input with the blocked gate
`generic_local_replay_forward_source_artifacts_blocked`. Task 105 is complete as
an explicitly authorized diagnosis of that failure with the gate
`local_replay_entity_lookup_failure_diagnosed`. Task 106 is complete as an
explicitly authorized opt-in missing-entity recovery canary with the partial
progress gate `local_replay_missing_entity_recovery_partial_progress`.

Do not create Task 107 automatically. Stop and wait for a human milestone
decision.

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

## Task 100

Purpose: normalize replay candidate filenames accidentally placed in
`replays/inbox/` into `.local/deadem/replays/inbox/` by rename only and create
safe metadata stubs.

Success gate: `human_replay_inbox_normalized`.

Blocked gate: `human_replay_inbox_normalization_blocked`.

Status: completed with the success gate above. Eleven local candidate filenames
are ready for future processing authorization with metadata stubs, but no
replay bytes were read, copied, hashed, parsed, or processed.

## Task 101

Purpose: process the authorized local human replay candidates 010-020 and
attempt to create a 15-human-replay factual batch.

Success gate: `factual_batch_15_ready`.

Blocked gate: `factual_batch_15_candidate_processing_blocked`.

Status: completed with the blocked gate above. Eleven candidate files were
hashed under explicit authorization, but zero were accepted because no scoped
generic parser/canonicalization command is available for arbitrary local input
paths without moving candidates into forbidden locations or introducing a
one-off workaround.

## Task 102

Purpose: create a bounded generic local-input replay processing canary for only
`.local/deadem/replays/inbox/partida_010.dem` mapped to `replay_010`.

Full success gate: `generic_local_replay_processing_canary_ready`.

Partial source-artifact gate:
`generic_local_replay_source_artifacts_ready_canonicalization_pending`.

Blocked gate: `generic_local_replay_processing_canary_blocked`.

Status: completed with the partial source-artifact gate above. The generic
local parser API can open the authorized local input and produce compact source
artifact summaries, but generic canonical package construction remains pending.

## Task 103

Purpose: generate the canonical source-artifact set needed for later factual
construction from only `.local/deadem/replays/inbox/partida_010.dem` mapped to
`replay_010`.

Success gate: `generic_local_replay_canonical_source_artifacts_ready`.

Blocked gate: `generic_local_replay_canonical_source_artifacts_blocked`.

Status: completed with the blocked gate above. Parser-source summary was ready,
but seek-dependent source classes blocked because the current generic
`deadem.Player` path failed with `Unable to find an entity with index [ 2905 ]`.
No canonical package was constructed. Task 104 was later executed only after
explicit authorization.

## Task 104

Purpose: replace Task 103's seek-dependent sampling with a forward-only source
artifact canary for only `.local/deadem/replays/inbox/partida_010.dem`.

Gate: `generic_local_replay_forward_source_artifacts_ready`.

Blocked gate: `generic_local_replay_forward_source_artifacts_blocked`.

Status: completed with the blocked gate above. Parser load succeeded and
forward-only advancement produced 15 samples across 953 ticks, but the same
`Unable to find an entity with index [ 2905 ]` failure occurred during forward
sampling. No canonical package was constructed and Task 105 was not created.

## Task 105

Purpose: diagnose the exact local replay entity lookup failure for only
`.local/deadem/replays/inbox/partida_010.dem`.

Gate: `local_replay_entity_lookup_failure_diagnosed`.

Blocked gate: `local_replay_entity_lookup_failure_diagnosis_blocked`.

Status: completed with the success gate above. Load-only passed. `nextTick`
alone failed after 953 ticks with `Unable to find an entity with index [ 2905 ]`
before any entity class lookup, field access, pawn/controller relationship
resolution, or extractor snapshot logic. The next recommended fix scope is
parser API investigation. No canonical package was constructed. Task 106 was
later executed only after explicit authorization.

## Task 106

Purpose: evaluate whether a bounded opt-in missing entity recovery path can
advance the authorized local replay canary beyond the Task 105 parser
advancement failure without changing default behavior or fabricating state.

Success gate: `local_replay_missing_entity_recovery_canary_ready`.

Partial gate: `local_replay_missing_entity_recovery_partial_progress`.

Blocked gate: `local_replay_missing_entity_recovery_blocked`.

Status: completed with the partial progress gate above. Default behavior still
reproduced the Task 105 `Unable to find an entity with index [ 2905 ]` failure.
Opt-in recovery skipped invalid missing-entity update payloads and advanced
past the prior 953-tick failure to tick 2862, then stopped on a later `entity
index out of range` parser boundary. No canonical package, factual artifacts,
Task 107, lane/region/proximity, mechanics, or strategic analysis were emitted.

## Non-Goals

- Do not inspect or process replay 005.
- Do not process bot fixtures 006-008.
- Do not start spatial, mechanic-effect, ML, macro, fight, rotation, pressure,
  role, or decision analysis.
- Do not treat replay 002 v8 as accepted.
- Do not create another workflow, cleanup, documentation, or repository
  refactoring task before the pilot finishes.
