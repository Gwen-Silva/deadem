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
progress gate `local_replay_missing_entity_recovery_partial_progress`. Task 107
is complete as an explicitly authorized diagnosis of the subsequent
out-of-range CREATE boundary with the gate
`local_replay_out_of_range_entity_create_boundary_diagnosed`.
Task 108 is complete as an explicitly authorized cursor-alignment diagnosis
around that boundary with the gate
`local_replay_entity_packet_cursor_alignment_diagnosed`.
Task 109 is complete as an explicitly authorized serialized entity payload
semantics diagnosis with the gate
`local_replay_serialized_entity_payload_semantics_diagnosed`.
Task 110 is complete as an explicitly authorized local proto/schema and
extractor-contract investigation with the gate
`local_replay_serialized_entities_semantics_investigated`.
Task 111 is complete as an explicitly authorized pre-recovery/default-path
payload-consumption baseline with the gate
`local_replay_pre_recovery_payload_consumption_baseline_ready`.
Task 112 is complete as an explicitly authorized field-level/cursor-level
diagnosis of the packet-953 pre-recovery mismatches with the gate
`local_replay_pre_recovery_mismatch_field_consumption_diagnosed`.
Task 113 is complete as an explicitly authorized loop-26 field-reader segment
accounting diagnosis with the gate
`local_replay_loop_26_field_reader_segments_diagnosed`.
Task 114 is complete as an explicitly authorized field path 59
decoder/serializer contract investigation with the gate
`local_replay_loop_26_fieldpath_59_decoder_contract_investigated`.
Task 115 is complete as an explicitly authorized runtime field definition
metadata capture for field path 59 with the gate
`local_replay_loop_26_fieldpath_59_runtime_definition_captured`.
Task 116 is complete as an explicitly authorized string-reader length and
payload-boundary accounting diagnosis for the same field path with the gate
`local_replay_loop_26_string_reader_accounting_diagnosed`.

Do not create Task 117 automatically. Stop and wait for a human milestone
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
lane/region/proximity, mechanics, or strategic analysis were emitted. Task 107
was later executed only after explicit authorization.

## Task 107

Purpose: diagnose the `entity index out of range` CREATE boundary reached by
Task 106's opt-in recovery pass for only
`.local/deadem/replays/inbox/partida_010.dem`.

Gate: `local_replay_out_of_range_entity_create_boundary_diagnosed`.

Blocked gate: `local_replay_out_of_range_entity_create_boundary_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 missing-entity failure. Opt-in recovery advanced past
953 ticks and reached the later boundary at current tick 2862. The failing
packet entry was CREATE loop 23 of 42 with accumulated entity index 570655505,
class ID 139, serial 35052, and class
`CCitadel_Ability_Frank_ShockTarget2`. The failure occurred at Entity
construction before baseline lookup, `registerEntity`, and field extraction.
No automatic recovery, canonical package, factual source artifacts,
lane/region/proximity, mechanics, or strategic analysis were emitted. Task 108
was later executed only after explicit authorization.

## Task 108

Purpose: diagnose whether the Task 107 `entity index out of range` boundary is
preceded by `CSVCMsg_PacketEntities.entityData` cursor misalignment, especially
around the recovered missing UPDATE at loop 22 and the CREATE at loop 23.

Gate: `local_replay_entity_packet_cursor_alignment_diagnosed`.

Blocked gate: `local_replay_entity_packet_cursor_alignment_blocked`.

Status: completed with the success gate above. The compact ledger captured
loops 18-23 of the failing packet. Loop 22 was a missing UPDATE for entity 6679
with payloadBits 266 and action `skipped_missing_update_payload`; the current
model moved from read count 5958 to 6224, which is internally consistent with
the next loop start. Loop 23 then decoded as CREATE with accumulated entity
index 570655505. Nearby bounded offset simulation found plausible entity
index/command pairs, including offset -2 bits decoding to CREATE entity 7694,
so cursor misalignment remains a viable hypothesis. The task did not prove
that loop 22 caused the boundary and did not recover, canonicalize, or emit
source artifacts. Task 109 was later executed only after explicit
authorization.

## Task 109

Purpose: diagnose whether values decoded from
`CSVCMsg_PacketEntities.serializedEntities` by `EntityPayloadSizeExtractor`
can be treated as the direct number of bits to skip after index + command for
missing UPDATE recovery.

Gate: `local_replay_serialized_entity_payload_semantics_diagnosed`.

Blocked gate: `local_replay_serialized_entity_payload_semantics_blocked`.

Status: completed with the success gate above. The replay_010 default pass
still reproduced the Task 105 missing entity failure, and opt-in recovery still
reached the Task 107/108 out-of-range CREATE boundary. The boundary packet
loops 18-23 were compared by read-count reference. Loop 21 was a present UPDATE
with `payloadBits` 227 but 363 bits consumed after command, confirming a
payload-size mismatch before loop 22. Loop 22 was a missing UPDATE with
`payloadBits` 266 and an after-command movement of 266 bits, but this is only
arithmetic evidence because no present entity extractor independently consumed
that entry. In the boundary packet, 21 of 22 present UPDATE entries before the
boundary matched after-command consumption, while loop 21 did not. Treat
`serializedEntities` payloadBits as unsafe direct missing-UPDATE skip input
until extractor/proto semantics are resolved. The task did not recover,
canonicalize, emit source artifacts, or create Task 110 automatically. Task 110
was later executed only after explicit authorization.

## Task 110

Purpose: investigate local proto/schema evidence and the
`EntityPayloadSizeExtractor` contract for
`CSVCMsg_PacketEntities.serializedEntities` without changing parser behavior,
recovery behavior, canonical facts, or source-artifact generation.

Gate: `local_replay_serialized_entities_semantics_investigated`.

Partial gate: `local_replay_serialized_entities_semantics_partially_investigated`.

Blocked gate: `local_replay_serialized_entities_semantics_blocked`.

Status: completed with the success gate above. Local Deadem, CS2, and Dota 2
proto sources and compiled proto JSON identify
`CSVCMsg_PacketEntities.serialized_entities` only as optional bytes field 13.
`EntityPayloadSizeExtractor` decodes a byte-oriented unsigned varint stream
from the bytes field, but treating those values as direct after-command skip
bits remains a local inference rather than schema proof. Task 109 loop 21 still
contradicts the direct skip assumption with `payloadBits` 227 versus 363
after-command consumed bits, and loop 22 remains not independently justified.
Missing-UPDATE recovery remains diagnostic-only. No parser or engine behavior
was changed, no recovery was added, no canonical package or factual artifacts
were emitted, and Task 111 was not created automatically. Task 111 was later
executed only after explicit authorization.

## Task 111

Purpose: collect a compact dynamic baseline of
`CSVCMsg_PacketEntities.serializedEntities` consumption in the default
pre-recovery path for replay_010 before the original Task 105 missing-entity
failure.

Gate: `local_replay_pre_recovery_payload_consumption_baseline_ready`.

Partial gate: `local_replay_pre_recovery_payload_consumption_baseline_partial`.

Blocked gate: `local_replay_pre_recovery_payload_consumption_baseline_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 failure at entity 2905. The diagnostic pass used
opt-in instrumentation without recovery allowances and failed closed at the
same missing-entity boundary. Before that failure, 954 packet summaries were
collected locally, 1,940 present UPDATE entries were compared, 1,936 matched
after-command consumption, and 4 mismatched before any recovery was attempted
with a largest absolute delta of 280 bits. This sustains the Task 109 loop 21
mismatch as not solely post-recovery contamination. Direct missing-UPDATE skip
remains unsafe and diagnostic-only. The full ledger remains local-only; no raw
entityData, raw serializedEntities, field values, parser recovery, canonical
package, source artifacts, factual events, spatial semantics, mechanics,
combat, macro, decision, or ML output was emitted. Task 112 was not created
automatically; it was later executed only after explicit authorization.

## Task 112

Purpose: diagnose, without parser recovery or canonicalization, why the four
present UPDATEs in replay_010 packet ordinal 953 mismatch
`serializedEntities payloadBits` versus after-command extractor consumption on
the default pre-recovery path.

Gate: `local_replay_pre_recovery_mismatch_field_consumption_diagnosed`.

Partial gate: `local_replay_pre_recovery_mismatch_field_consumption_partial`.

Blocked gate: `local_replay_pre_recovery_mismatch_field_consumption_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 missing-entity failure, and the diagnostic pass failed
closed at the same entity 2905 boundary without recovery. Packet 953 and loops
26-29 were analyzed. Loop 26 consumed 501 bits through extractor accounting
despite `payloadBits` 221, an extra 280 bits. Loops 27-29 decoded zero extractor
mutations and consumed zero bits at the current cursor despite positive
payloadBits. Payload iterator count aligned with updatedEntries and target-loop
read counts remained monotonic. The evidence supports a field-level or
cursor-accounting mismatch but does not prove Source 2 semantics, replay
corruption, or a safe missing-UPDATE skip. No parser fix, recovery, canonical
package, source artifact, factual event, spatial semantic, mechanic, combat,
macro, decision, or ML output was emitted. Task 113 was not created
automatically; it was later executed only after explicit authorization.

## Task 113

Purpose: inspect, without field values or parser recovery, which loop-26
field-reader segments explain the extra 280 bits in replay_010 packet ordinal
953.

Gate: `local_replay_loop_26_field_reader_segments_diagnosed`.

Partial gate: `local_replay_loop_26_field_reader_segments_partial`.

Blocked gate: `local_replay_loop_26_field_reader_segments_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 missing-entity failure, and the diagnostic pass failed
closed at the same entity 2905 boundary without recovery. Loop 26 remained
entity 2598, class `CCitadel_Ability_Familiar_HelpingHands`, `payloadBits` 221,
and 501 actual bits consumed after command. The extractor recorded 7 field
reader segments: segment sum 448 bits, field-path accounting 53 bits, and total
extractor consumption 501 bits. The largest segment consumed 288 bits, so one
segment accounts for most of the extra 280 bits, but it does not exactly equal
the extra. Loops 27-29 produced zero field paths and zero field reader segments
at the current cursor by local metrics only. The comparative hypotheses remain
possible or supported locally, while causal conclusion remains
`not_determined`. No field values, raw entityData, raw serializedEntities, raw
payloads, parser fix, recovery, canonical package, source artifact, factual
event, spatial semantic, mechanic, combat, macro, decision, or ML output was
emitted. Task 114 was not created.

## Task 114

Purpose: investigate, without field values, parser recovery, or parser fixes,
whether replay_010 packet ordinal 953 loop 26 field path 59
`m_nAvailableHelperCount` receiving `decodeString` and `MISC` storage is
coherent with the local serializer/decoder contract.

Gate: `local_replay_loop_26_fieldpath_59_decoder_contract_investigated`.

Partial gate: `local_replay_loop_26_fieldpath_59_decoder_contract_partial`.

Blocked gate: `local_replay_loop_26_fieldpath_59_decoder_contract_blocked`.

Status: completed with the success gate above. The local runtime serializer
metadata and decoder catalog support the `decodeString`/`MISC` assignment, and
Task 113's largest 288-bit segment was matched exactly. The field name remains
suspicious by convention, but no parser bug, Source 2 semantic conclusion,
replay corruption conclusion, recovery recommendation, canonical package, field
value, raw payload, source artifact, factual event, spatial semantic,
mechanic, combat, macro, decision, or ML output was emitted. No Task 115 was
created.

## Task 115

Purpose: capture, without field values, parser recovery, parser fixes, or
canonical output, the runtime field definition metadata that led replay_010
packet ordinal 953 loop 26 field path 59 `m_nAvailableHelperCount` to resolve
to `decodeString` and `MISC` storage.

Gate: `local_replay_loop_26_fieldpath_59_runtime_definition_captured`.

Partial gate: `local_replay_loop_26_fieldpath_59_runtime_definition_partial`.

Blocked gate: `local_replay_loop_26_fieldpath_59_runtime_definition_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 missing-entity failure, and the diagnostic pass failed
closed at the same entity 2905 boundary without recovery. Field path 59 was
captured from local runtime metadata as varType `char`, classified as
string-like, with `decodeString` and `MISC` storage. This makes the decoder
assignment more coherent locally while preserving the field-name suspicion and
causal conclusion `not_determined`. No field values, raw payload, raw
entityData, raw serializedEntities, full raw send-table payload, parser fix,
recovery, canonical package, source artifact, factual event, spatial semantic,
mechanic, combat, macro, decision, or ML output was emitted.

## Task 116

Purpose: diagnose, without string values, raw bytes, parser recovery, parser
fixes, or canonical output, how replay_010 packet ordinal 953 loop 26 field
path 59 `decodeString` consumed 288 bits and how that segment relates to the
loop 26 `payloadBits` boundary.

Gate: `local_replay_loop_26_string_reader_accounting_diagnosed`.

Partial gate: `local_replay_loop_26_string_reader_accounting_partial`.

Blocked gate: `local_replay_loop_26_string_reader_accounting_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 missing-entity failure, and the diagnostic pass failed
closed at the same entity 2905 boundary without recovery. Field path 59's
`decodeString` segment consumed 36 bytes, observed a null terminator after 35
non-null bytes, and stopped because of that null terminator. The segment began
8 bits before loop 26's expected `payloadBits` end and ended 280 bits after it.
This is a metric boundary-crossing result, not a Source 2 semantic, parser bug,
replay corruption, or causal conclusion. No field values, string values, string
bytes, raw payload, raw entityData, raw serializedEntities, full raw send-table
payload, parser fix, recovery, canonical package, source artifact, factual
event, spatial semantic, mechanic, combat, macro, decision, or ML output was
emitted. No Task 117 was created.

## Non-Goals

- Do not inspect or process replay 005.
- Do not process bot fixtures 006-008.
- Do not start spatial, mechanic-effect, ML, macro, fight, rotation, pressure,
  role, or decision analysis.
- Do not treat replay 002 v8 as accepted.
- Do not create another workflow, cleanup, documentation, or repository
  refactoring task before the pilot finishes.
