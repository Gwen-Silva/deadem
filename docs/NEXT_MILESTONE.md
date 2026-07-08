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
Task 117 is complete as an explicitly authorized payload-size iterator
alignment diagnosis for packet 953 with the gate
`local_replay_packet_953_payload_iterator_alignment_diagnosed`.
Task 118 is complete as an explicitly authorized post-loop26 buffer-boundary
diagnosis for packet 953 with the gate
`local_replay_packet_953_buffer_boundary_diagnosed`.
Task 119 is complete as an explicitly authorized opt-in fail-closed
PacketEntities boundary-guard evaluation for packet 953 with the gate
`local_replay_packet_entities_boundary_guard_diagnosed`.
Task 120 is complete as an explicitly authorized opt-in PacketEntities
boundary-truncation evaluation for packet 953 with the gate
`local_replay_packet_entities_boundary_truncation_no_progress`.
Task 121 is complete as an explicitly authorized registry lifecycle, nearby
index, and packet-954 context diagnosis for entity 2905 with the gate
`local_replay_entity_2905_registry_and_packet_context_diagnosed`.
Task 122 is complete as an explicitly authorized entity-index allocation gap
and missing CREATE provenance diagnosis around entity 2905 with the gate
`local_replay_entity_index_allocation_gap_diagnosed`.
Task 123 is complete as an explicitly authorized external parser prior-art and
second-canary triage with the gate
`replay_parser_prior_art_and_second_canary_triage_ready`.
Task 124 is complete as an explicitly authorized external parser oracle
feasibility comparison with the gate `external_parser_oracle_canaries_ready`.
Task 125 is complete as an explicitly authorized Clarity oracle viability
decision with the gate `clarity_oracle_viability_decided`.

Task 126 attempted to restore the direct GPT -> Codex workflow after the
abandoned iaflow/Product Reviewer/WSL automation route. The tracked cleanup is
recorded under `direct_codex_workflow_restored`. Task 126 is not parser
progress.

Task 127 is complete with the gate `independent_missing_entity_strategy_ready`.
The selected next action is `add_diagnostic_fail_closed_review_next`: a future
task may review a bounded fail-closed diagnostic route, but Task 127 does not
authorize recovery, skip mode, parser fixes, default behavior changes, external
parser execution, Java setup, or new replay processing.

Task 128 is complete with the gate
`diagnostic_fail_closed_missing_entity_contract_ready`. It reviewed the
diagnostic fail-closed contract and does not authorize implementation. A future
implementation still requires a separate human-authored task.

Task 129 is complete with the gate
`diagnostic_fail_closed_missing_entity_implemented`. It implemented the
separately authorized disabled-by-default missing-entity diagnostic hook
`recovery.diagnoseMissingEntityFailClosed` and validated it with synthetic
fixtures. Default behavior remains unchanged, and the diagnostic does not
recover, skip, create placeholders, continue parsing, emit canonical facts, or
process replays.

Task 130 is complete with the gate
`diagnostic_fail_closed_config_isolation_ready`. It hardened
`recovery.diagnoseMissingEntityFailClosed` by rejecting incompatible recovery
and truncation options at configuration construction. This preserves default
behavior and keeps validation synthetic-only.

Task 131 is complete with the gate
`diagnostic_fail_closed_replay_010_canary_ready`. It ran only replay_010 and
confirmed the diagnostic captures packet 954 loop 33 for missing entity 2905
while still throwing without recovery, skip, placeholders, canonical facts, or
continuation.

Task 132 is complete with the gate
`diagnostic_fail_closed_replay_011_canary_ready`. It ran only replay_011 and
confirmed the diagnostic captures packet 1052 loop 28 for missing entity 5624
while still throwing without recovery, skip, placeholders, canonical facts, or
continuation.

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
emitted. At Task 116 completion, no Task 117 had been created automatically.

## Task 117

Purpose: diagnose, without parser recovery, parser fixes, canonical output, or
match facts, whether the decoded `serializedEntities` payload-size iterator for
replay_010 packet ordinal 953 is aligned to entries 26-29 or whether small
shifts, grouped sums, or cumulative nearby boundaries better explain the loop
26/27-29 mismatch.

Gate: `local_replay_packet_953_payload_iterator_alignment_diagnosed`.

Partial gate: `local_replay_packet_953_payload_iterator_alignment_partial`.

Blocked gate: `local_replay_packet_953_payload_iterator_alignment_blocked`.

Status: completed with the success gate above. The diagnostic reused Task 116
default and opt-in diagnostic failure evidence without parser recovery. Packet
953 has `payloadSizeCount` equal to `updatedEntries` with no null or undefined
payload sizes, supporting one payload size per entry. The current alignment
does not explain loop 26, no small shift reduces the loop 26-29 mismatch,
grouped payload sums do not exactly match loop 26 actual consumption, and
nearby cumulative boundaries do not close the residual. The conclusion remains
`not_determined`; the local payloadBits non-boundary or field-level accounting
mismatch hypothesis is strengthened. No field values, string values, string
bytes, raw payload, raw entityData, raw serializedEntities, full raw
send-table payload, parser fix, recovery, canonical package, source artifact,
factual event, spatial semantic, mechanic, combat, macro, decision, or ML
output was emitted. At Task 117 completion, no Task 118 had been created
automatically.

## Task 118

Purpose: diagnose, without parser recovery, parser fixes, canonical output, or
match facts, whether replay_010 packet ordinal 953 loops 27-29 are valid entry
reads or cursor/buffer-boundary artifacts after loop 26 consumed nearly all of
the local `entityData` bit window.

Gate: `local_replay_packet_953_buffer_boundary_diagnosed`.

Partial gate: `local_replay_packet_953_buffer_boundary_partial`.

Blocked gate: `local_replay_packet_953_buffer_boundary_blocked`.

Status: completed with the success gate above. The diagnostic reused Task 117
default and opt-in diagnostic failure evidence without parser recovery. Loop
26 ended at read count 5343 with `entityDataBitLength` 5344, leaving one bit.
Loop 27's index read begins with that one remaining bit and crosses the
boundary; loops 28 and 29 begin beyond the boundary. Synthetic `BitBuffer`
tests without replay bytes showed `move` and `read()` guard against overrun,
while `readBitsAsUInt`, `readUInt8`, `readUVarInt`, and `readUVarInt32` can
advance beyond the end without throwing in local synthetic cases. This
strengthens a buffer-boundary artifact and parser bounds-check hypothesis,
but causal conclusion remains `not_determined`. No field values, string
values, string bytes, raw payload, raw entityData, raw serializedEntities,
full raw send-table payload, parser fix, recovery, canonical package, source
artifact, factual event, spatial semantic, mechanic, combat, macro, decision,
or ML output was emitted. At Task 118 completion, no Task 119 had been created
automatically.

## Task 119

Purpose: evaluate, without default parser fixes, parser recovery, canonical
output, or match facts, whether an opt-in fail-closed PacketEntities
`entityData` boundary guard stops replay_010 packet ordinal 953 before loops
27-29 continue as phantom entries.

Gate: `local_replay_packet_entities_boundary_guard_diagnosed`.

Partial gate: `local_replay_packet_entities_boundary_guard_partial`.

Blocked gate: `local_replay_packet_entities_boundary_guard_blocked`.

Status: completed with the success gate above. Default behavior without the
guard still reproduced the Task 105 missing entity 2905 failure. The guard
pass used recovery diagnostics only, with no recovery actions, and stopped at
packet 953 loop 27 after-index read count 5349, five bits beyond
`entityDataBitLength` 5344, before reaching the original packet 954 missing
entity. The diagnostic matches Task 118's expected boundary, prevents loops
27-29 from continuing as semantic updates in the guarded pass, creates no
placeholder entity or fake fields, and leaves the guard disabled by default.
No raw replay bytes, raw entityData, raw serializedEntities, raw payloads,
string bytes, string values, field values, full raw send-table payload,
parser default fix, recovery, canonical package, source artifact, factual
event, spatial semantic, mechanic, combat, macro, decision, or ML output was
emitted. Task 120 was not created automatically; it was later explicitly
authorized.

## Task 120

Purpose: evaluate, without default parser fixes, canonical output, or match
facts, whether opt-in PacketEntities boundary truncation can end packet 953
before loops 27-29 phantom/trailing/out-of-buffer reads and continue beyond
the original missing entity 2905 failure.

Gate: `local_replay_packet_entities_boundary_truncation_partial_progress`.

No-progress gate: `local_replay_packet_entities_boundary_truncation_no_progress`.

Blocked gate: `local_replay_packet_entities_boundary_truncation_blocked`.

Status: completed with the no-progress gate. Default behavior without
truncation still reproduced the Task 105 missing entity 2905 failure.
Truncation was opt-in and disabled by default; it triggered at packet 953 loop
27 with read count 5343 and one bit remaining, before the fail-closed guard's
after-index boundary at read count 5349. It prevented loops 27-29 from being
applied as semantic updates and created no placeholder entity, fake fields, or
canonical facts. The truncation pass still reached the same missing entity
2905 failure afterward, so structural packet-end truncation alone did not
advance past the original failure. No raw replay bytes, raw entityData, raw
serializedEntities, raw payloads, string bytes, string values, field values,
full raw send-table payload, parser default fix, canonical package, source
artifact, factual event, spatial semantic, mechanic, combat, macro, decision,
or ML output was emitted. No Task 121 was created during Task 120.

## Task 121

Purpose: diagnose, without parser recovery, parser fixes, canonical output, or
match facts, the replay_010 entity 2905 failure across registry lifecycle,
nearby index context, first missing update packet context, and default versus
packet-953 truncation behavior.

Gate: `local_replay_entity_2905_registry_and_packet_context_diagnosed`.

Partial gate: `local_replay_entity_2905_registry_and_packet_context_partial`.

Blocked gate: `local_replay_entity_2905_registry_and_packet_context_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 missing entity 2905 failure. The registry diagnostic
pass and truncation+registry diagnostic pass used no missing-entity recovery
and no missing-baseline recovery, and both failed closed at the same entity
2905 missing update. Entity 2905 was not observed as created, registered,
deleted, left, or deactivated before the failure; its first known reference was
packet ordinal 954 loop 33, already an UPDATE against missing registry state.
Nearby indexes 2900-2902 were created and registered normally, packet 954 read
counts stayed inside `entityDataBitLength`, and truncating packet 953 did not
change entity 2905 registry history. The bounded classification is
`first_missing_update_to_never_registered_entity`. No raw replay bytes, raw
entityData, raw serializedEntities, raw payloads, string bytes, string values,
field values, full raw send-table payload, parser default fix, recovery,
canonical package, source artifact, factual event, spatial semantic, mechanic,
combat, macro, decision, or ML output was emitted. No Task 122 was created
during Task 121.

## Task 122

Purpose: diagnose, without parser recovery, parser fixes, canonical output, or
match facts, the replay_010 entity 2905 missing CREATE provenance and
entity-index allocation gap around indexes 2880-2920.

Gate: `local_replay_entity_index_allocation_gap_diagnosed`.

Partial gate: `local_replay_entity_index_allocation_gap_partial`.

Blocked gate: `local_replay_entity_index_allocation_gap_blocked`.

Status: completed with the success gate above. Default behavior still
reproduced the Task 105 missing entity 2905 failure. The allocation diagnostic
pass and truncation+allocation diagnostic pass used no missing-entity recovery
and no missing-baseline recovery, and both reached the same packet 954 loop 33
missing UPDATE. Indexes 2897-2902 were observed as CREATE/register entries
before the failure, while 2903-2910 remained an allocation gap except for the
missing UPDATE reference to 2905. For entity 2905 itself, no CREATE,
registerEntity attempt, class lookup, baseline lookup, or earlier failure
stage was observed. Packet 954 remained locally bounded, the jump to 2905 was
large but monotonic in the local window, and packet 953 truncation did not
change the allocation/provenance evidence. The bounded classification is
`never_registered_entity_with_create_gap`. No raw replay bytes, raw entityData,
raw serializedEntities, raw payloads, string bytes, string values, field
values, full raw send-table payload, parser default fix, recovery, canonical
package, source artifact, factual event, spatial semantic, mechanic, combat,
macro, decision, or ML output was emitted. No Task 123 was created.

## Task 123

Purpose: triage replay_010 parser diagnosis against external Source/Source 2
parser prior art and a minimal second local canary probe of replay_011.

Gate: `replay_parser_prior_art_and_second_canary_triage_ready`.

Partial gate: `replay_parser_prior_art_and_second_canary_triage_partial`.

Blocked gate: `replay_parser_prior_art_and_second_canary_triage_blocked`.

Status: completed with the success gate above. Four mature public parser
repositories were inspected in local-only shallow clones and no inspected
PacketEntities path showed implicit CREATE for an UPDATE to a never-registered
entity. Replay_011 loaded and reproduced the same missing-entity lookup class
under a bounded minimal `nextTick` probe, failing on entity 5624 after 1051
ticks. The current blocker is classified as a local replay class issue, and
the recommended next action is external oracle comparison before further local
parser intervention. No parser default behavior, recovery, canonical package,
source artifact, match facts, raw replay bytes, external source tree, `.dem`,
or `.local` file was committed. No Task 124 was created during Task 123.

## Task 124

Purpose: evaluate whether mature external parser clones can serve as practical
local-only oracles for replay_010 and replay_011 canaries.

Gate: `external_parser_oracle_canaries_ready`.

Partial gate: `external_parser_oracle_canaries_partial`.

Blocked gate: `external_parser_oracle_canaries_blocked`.

Status: completed with the success gate above. The local Task 123 clones were
inspected in order. `skadistats/clarity` advertises Deadlock/citadel support
and exposes library runner APIs, but the offline feasibility probe blocked on
missing Java/runtime setup before a canary oracle could run. `manta`,
`demoparser`, and `demoinfocs-golang` did not show practical Deadlock support
in the inspected local evidence. No external parser confirmed or contradicted
the local missing-entity failures for replay_010 or replay_011. The
recommended next action is `manual_external_oracle_setup_needed`. No parser
default behavior, recovery, canonical package, source artifact, match facts,
raw replay bytes, external source tree, `.dem`, or `.local` file was committed.
No Task 125 was created.

## Task 125

Purpose: decide whether `skadistats/clarity` is a viable external oracle for
the authorized local Deadlock canaries under current environment conditions.

Gate: `clarity_oracle_viability_decided`.

Partial gate: `clarity_oracle_viability_partial`.

Blocked gate: `clarity_oracle_viability_blocked`.

Status: completed with the success gate above. The final decision category is
`oracle_inviavel_no_ambiente_atual`. The local Clarity clone exists and has the
same inspected ref as Task 124, and the Gradle wrapper is present, but `java`
and `javac` are unavailable and `JAVA_HOME` is unset. The task stopped before
turning into Java/Gradle/Clarity setup or debugging. No Clarity code, local
parser code, recovery, canonical package, source artifact, match facts, raw
replay bytes, external source tree, `.dem`, or `.local` file was committed. No
Task 126 was created.

## Task 127

Purpose: choose the next bounded local strategy for the repeated PacketEntities
`missing entity` class observed in replay_010 and replay_011, without using
Clarity runtime, Java/JDK, external parsers, WSL, iaflow, Product Reviewer
automation, parser changes, recovery, skip mode, or new replay processing.

Gate: `independent_missing_entity_strategy_ready`.

Partial gate: `independent_missing_entity_strategy_partial`.

Blocked gate: `independent_missing_entity_strategy_blocked`.

Status: completed with the success gate above. The blocker summary consolidates
replay_010/entity 2905 as a never-registered entity with create/provenance gap
and replay_011/entity 5624 as the same local missing-entity lookup class.
Static prior-art observations are limited to existing local evidence and are
classified as `documented_behavior`, `inferred_behavior`, or `open_question`.
The selected next action is `add_diagnostic_fail_closed_review_next`. This is a
strategy decision only and does not implement or specify recovery, skip mode,
placeholders, parser default changes, or a parser fix. Task 128 was later
authorized separately as a contract review task.

## Task 128

Purpose: review the technical contract for a possible future diagnostic
fail-closed response to PacketEntities missing-entity failures.

Gate: `diagnostic_fail_closed_missing_entity_contract_ready`.

Partial gate: `diagnostic_fail_closed_missing_entity_contract_partial`.

Blocked gate: `diagnostic_fail_closed_missing_entity_contract_blocked`.

Status: completed with the success gate above. Diagnostic fail-closed is
defined as a possible future diagnostic-only stop at the first missing-entity
PacketEntities boundary with compact metadata and no continuation as if the
UPDATE were valid. The review distinguishes this from current fail-fast,
recovery, skip mode, placeholder entities, and parser fixes. It does not
authorize implementation, parser or engine changes, replay processing,
external runtime execution, canonical facts, or semantic claims. No Task 129
was created.

## Task 129

Purpose: implement the authorized disabled-by-default diagnostic fail-closed
metadata hook for PacketEntities missing-entity failures.

Gate: `diagnostic_fail_closed_missing_entity_implemented`.

Status: completed with the success gate above. The new
`recovery.diagnoseMissingEntityFailClosed` option records compact diagnostic
metadata at the existing missing-entity failure boundary and still throws
without recovery, skip mode, placeholder entities, fake fields, synthetic
registry state, parser continuation, canonical facts, replay processing, or
semantic claims. Default parser behavior remains unchanged.

## Task 130

Purpose: harden missing-entity diagnostic configuration isolation so
`recovery.diagnoseMissingEntityFailClosed` cannot be combined with options that
would undermine fail-closed behavior.

Gate: `diagnostic_fail_closed_config_isolation_ready`.

Status: completed with the success gate above. `ParserConfiguration` rejects
the diagnostic option when combined with `allowUnresolvedEntityReference`,
`allowMissingClassBaseline`, or `allowEntityPacketBoundaryTruncation`. No
handler behavior change, recovery, skip mode, replay processing, canonical
facts, or semantic claims were added.

## Task 131

Purpose: run a replay_010-only canary for
`recovery.diagnoseMissingEntityFailClosed`.

Gate: `diagnostic_fail_closed_replay_010_canary_ready`.

Status: completed with the success gate above. Default replay_010 parsing still
fails with missing entity 2905. The diagnostic pass, using only
`recovery.diagnoseMissingEntityFailClosed: true`, records one compact
`missing_entity_fail_closed` diagnostic at packet ordinal 954 loop 33 and still
throws. No recovery, skip mode, placeholder/fake entity, field materialization,
payload skip, update application, continuation, canonical facts, or semantic
claims were produced. No replay other than replay_010 was processed.

## Task 132

Purpose: run a replay_011-only canary for
`recovery.diagnoseMissingEntityFailClosed`.

Gate: `diagnostic_fail_closed_replay_011_canary_ready`.

Status: completed with the success gate above. Default replay_011 parsing still
fails with missing entity 5624. The diagnostic pass, using only
`recovery.diagnoseMissingEntityFailClosed: true`, records one compact
`missing_entity_fail_closed` diagnostic at packet ordinal 1052 loop 28 and
still throws. No recovery, skip mode, placeholder/fake entity, field
materialization, payload skip, update application, continuation, canonical
facts, or semantic claims were produced. No replay other than replay_011 was
processed.

## Task 133

Purpose: consolidate the replay_010 and replay_011 diagnostic fail-closed
canaries and choose one bounded next route.

Gate: `dual_missing_entity_diagnostic_canaries_consolidated`.

Status: completed with the success gate above. The consolidation compares
replay_010 packet 954 loop 33 entity 2905 with replay_011 packet 1052 loop 28
entity 5624. Both canaries preserve the same `missing_entity_fail_closed`
class with no continuation, recovery, skip mode, placeholder/fake entity,
field materialization, payload skip, update application, canonical facts, or
semantic claims. The selected next action is
`request_human_decision_for_parser_intervention_design`. No replay was
processed, and no parser/engine change was made.

## Task 134

Purpose: review design boundaries for a possible future parser intervention
for the repeated `missing_entity_fail_closed` class.

Gate: `missing_entity_parser_intervention_design_ready`.

Status: completed with the success gate above. The review selected
`prepare_bounded_parser_intervention_spec_for_human_approval` as the next
route. It does not authorize parser implementation, recovery, skip mode,
placeholder entities, fake fields, synthetic registry state, continuation
after missing entity, default behavior changes, new opt-in behavior, replay
processing, canonical/source/match outputs, or semantic claims.

## Task 135

Purpose: prepare a bounded, non-implementing parser-intervention spec for the
repeated `missing_entity_fail_closed` class.

Gate: `missing_entity_bounded_parser_intervention_spec_ready`.

Status: completed with the success gate above. The spec selects
`diagnostic_index_lifecycle_probe_only` for future human approval. It defines
scope, boundaries, validation, gates, rejection criteria, and human approval
requirements for a future diagnostic-only implementation, but does not
authorize implementation, parser/engine changes, replay processing, recovery,
skip mode, placeholders, default behavior changes, new opt-in behavior,
canonical/source/match outputs, or semantic claims.

## Task 136

Purpose: implement the approved diagnostic index/lifecycle probe extension for
the existing `recovery.diagnoseMissingEntityFailClosed` mode.

Gate: `missing_entity_index_lifecycle_probe_ready`.

Status: completed with the success gate above. The diagnostic records compact
packet-local lifecycle metadata and a conservative classification candidate
while preserving the same missing-entity throw. Synthetic tests confirm no
continuation, recovery, skip mode, placeholder/fake entity, payload skip,
update application, canonical output, replay processing, default behavior
change, or new opt-in option.

## Task 137

Purpose: run the diagnostic index/lifecycle probe on the authorized replay_010
canary only.

Gate: `missing_entity_index_lifecycle_probe_replay_010_canary_ready`.

Status: completed with the success gate above. The diagnostic pass used only
`recovery.diagnoseMissingEntityFailClosed: true`, captured packet 954 loop 33
for missing entity 2905, recorded the new lifecycle/classification fields, and
still threw fail-closed. The observed classification is `not_determined`. No
recovery, skip mode, placeholder/fake entity, synthetic registry state,
payload skip, update application, continuation, default behavior change, raw
data versioning, canonical output, source artifact, match fact, or additional
replay processing occurred.

## Task 138

Purpose: run the diagnostic index/lifecycle probe on the authorized replay_011
canary only.

Gate: `missing_entity_index_lifecycle_probe_replay_011_canary_ready`.

Status: completed with the success gate above. The diagnostic pass used only
`recovery.diagnoseMissingEntityFailClosed: true`, captured packet 1052 loop 28
for missing entity 5624, recorded the new lifecycle/classification fields, and
still threw fail-closed. The observed classification is `not_determined`. No
recovery, skip mode, placeholder/fake entity, synthetic registry state,
payload skip, update application, continuation, default behavior change, raw
data versioning, canonical output, source artifact, match fact, or additional
replay processing occurred.

## Task 139

Purpose: consolidate the replay_010 and replay_011 index lifecycle probe
canaries and choose one bounded next route without replay processing or parser
changes.

Gate: `index_lifecycle_probe_canaries_consolidated`.

Status: completed with the success gate above. Both canaries remain
`classificationCandidate: not_determined`: replay_010 stopped fail-closed at
packet 954 loop 33 UPDATE entity 2905, and replay_011 stopped fail-closed at
packet 1052 loop 28 UPDATE entity 5624. The consolidation separates observed
facts from hypotheses, weak inferences, indetermined questions, and forbidden
claims. It selected
`prepare_replay_wide_lifecycle_diagnostic_spec_for_human_approval` as the next
bounded route because packet-local evidence is insufficient to decide
replay-wide lifecycle or index-stream cause. No replay was processed, and no
parser/engine change, recovery, skip mode, placeholder, raw data capture, or
canonical/source/match output was produced.

## Task 140

Purpose: prepare a bounded, non-implementing spec for a future replay-wide
lifecycle/registry diagnostic for the repeated `missing_entity_fail_closed`
class.

Gate: `replay_wide_lifecycle_diagnostic_spec_ready`.

Status: completed with the success gate above. The selected alternative is
`design_replay_wide_entity_lifecycle_ledger`. The spec defines the compact
metadata, forbidden raw data, classification candidates, fail-closed
boundaries, validation plan, gates, and rejection criteria for a possible
future diagnostic-only implementation. It does not authorize implementation,
replay processing, parser/engine changes, recovery, skip mode, placeholder
entities, continuation after missing entity, default behavior changes,
canonical/source/match outputs, or semantic claims. Any future implementation
or canary run still requires separate human authorization.

## Task 141

Purpose: implement the approved diagnostic-only replay-wide/local-parser
lifecycle ledger for the existing `recovery.diagnoseMissingEntityFailClosed`
mode using synthetic validation only.

Gate: `replay_wide_lifecycle_diagnostic_implemented`.

Status: completed with the success gate above. The implementation records
compact lifecycle/registry metadata in the existing diagnostic mode and adds a
local parser lifecycle summary plus diagnostic classification fields at the
first missing entity boundary. Synthetic tests cover `not_determined`,
`created_then_missing_registry_state_candidate`, and
`removed_before_missing_update_candidate`. The mode remains disabled by
default, creates no new opt-in option, and still throws fail-closed with no
recovery, skip mode, placeholder/fake entity, synthetic registry state,
continuation after missing entity, canonical/source/match output, or replay
processing.

## Task 142

Purpose: review the local PacketEntities missing-entity parser mechanism before
running another canary.

Gate: `packetentities_missing_entity_parser_mechanism_reviewed`.

Status: completed with a static-only review. The review maps entity index
accumulation, two-bit command decoding, CREATE/UPDATE/LEAVE/DELETE registry
lifecycle, payloadBits usage, and the evidence needed to distinguish lifecycle,
registry state, cursor/command, class/baseline, payloadBits, and unknown Source
semantics candidates. It recommends a future authorized fail-closed run of the
existing Task 141 replay-wide lifecycle ledger on one canary at a time. No
replay was processed, no parser/engine behavior was modified, and no recovery,
skip mode, placeholder, continuation, new opt-in, default behavior change,
canonical/source/match output, or Task 143 was created.

## Task 143

Purpose: run the existing fail-closed replay-wide/local-parser lifecycle ledger
on the authorized replay_010 canary.

Gate: `replay_wide_lifecycle_diagnostic_replay_010_canary_ready`.

Status: completed. Default and diagnostic passes reproduced `Unable to find an
entity with index [ 2905 ]` at packet ordinal 954, loop 33, operation UPDATE,
previousEntityIndex 2717, indexDelta 187, and payloadBits 193. The ledger
tracked 4852 compact events before the boundary and zero compact target events
for entity 2905, producing
`never_registered_in_observed_parser_history_candidate`. This is local parser
diagnostic evidence only and does not mean the entity never existed in game. No
parser/engine behavior changed, no recovery/skip/placeholder/continuation/new
opt-in was used, and no raw/canonical/source/match output was produced.

## Task 144

Purpose: run the existing fail-closed replay-wide/local-parser lifecycle ledger
on the authorized replay_011 canary and compare compact evidence with Task 143.

Gate: `replay_wide_lifecycle_diagnostic_replay_011_canary_ready`.

Status: completed. Default and diagnostic passes reproduced `Unable to find an
entity with index [ 5624 ]` at packet ordinal 1052, loop 28, operation UPDATE,
previousEntityIndex 2681, indexDelta 2942, and payloadBits 133. The ledger
tracked 41408 compact events before the boundary and zero compact target events
for entity 5624, producing `index_stream_or_cursor_contract_suspected` because
the compact cursor/index metadata includes a large index delta. This is local
parser diagnostic evidence only and does not prove a parser bug, Source 2
semantics, replay corruption, or parser correctness. Compared with replay_010,
both human canaries show an UPDATE for an entity index with zero compact prior
local-parser events before the boundary, while replay_011 adds stronger
cursor/index-contract suspicion. No parser/engine behavior changed, no
recovery/skip/placeholder/continuation/new opt-in was used, and no
raw/canonical/source/match output was produced.

## Task 145

Purpose: consolidate replay_010 and replay_011 lifecycle-ledger canaries and
review the local PacketEntities index/cursor/command/payloadBits contract
before any parser fix.

Gate: `high_index_missing_update_cursor_contract_reviewed`.

Status: completed. The review found a shared pattern: both canaries fail closed
on UPDATE for a missing target with zero compact prior local-parser target
events. replay_011 adds the stronger cursor/index signal with indexDelta 2942.
The local contract is: read `indexDelta` with `readUVarInt`, accumulate
`entityIndex = previous + indexDelta + 1`, then read a two-bit command mapped
to UPDATE/LEAVE/CREATE/DELETE. The high delta is not proof of a bug by itself;
it is a compact suspicion signal that still needs bounded cursor/index evidence
before behavior changes. The selected next route is
`design_cursor_index_contract_probe_spec`, a non-implementing spec for a future
fail-closed, compact-only, one-replay-per-task cursor/index probe. No replay was
processed, no parser/engine behavior changed, and no recovery/skip/placeholder
or canonical/source/match output was produced.

## Task 146

Purpose: prepare a non-implementing spec for a future fail-closed
cursor/index/command contract probe around PacketEntities
`missing_entity_fail_closed` boundaries.

Gate: `cursor_index_contract_probe_spec_ready`.

Status: completed. The spec defines the compact evidence a future probe would
need to collect around `beforeIndex`, `afterIndex`, `afterCommand`,
`afterAction`, `indexDelta`, accumulated `entityIndex`, command bits,
payloadBits, and nearby-window consistency. It recommends replay_011 as the
first future canary only if separately authorized because replay_011 adds the
stronger high-delta signal. This task did not implement the probe, process
replays, modify parser/engine behavior, add recovery/skip/placeholder logic,
create a new opt-in, change default behavior, or emit canonical/source/match
output.

## Task 147

Purpose: implement and run the compact fail-closed cursor/index/command
contract probe on authorized replay_011 only.

Gate: `cursor_index_contract_probe_replay_011_ready`.

Status: completed. The probe reached the expected replay_011 boundary at
packet 1052 loop 28, UPDATE entity 5624, previousEntityIndex 2681,
indexDelta 2942, payloadBits 133. The local index formula and command decode
position were internally consistent, and read counts stayed within entityData.
The boundary itself did not consume payload because the parser stopped
fail-closed, but the five-entry pre-boundary window found one compact
payloadBits/action-delta divergence at loop 27. The final diagnostic
classification is `payloadbits_contract_suspected`. Nearby offset alternatives
were recorded only as compact candidates, not as a replacement cursor. No
recovery, skip, placeholder, continuation, parser fix, default behavior change,
canonical/source/match output, raw data, or semantic claim was produced.

## Task 148

Purpose: statically review whether `serializedEntities` `payloadBits` and
measured `afterAction - afterCommand` action deltas form a direct cursor
contract.

Gate: `payloadbits_action_delta_contract_reviewed`.

Status: completed. The review found that the comparison is conditional, not a
universal direct-equality contract. `payloadBits` is decoded from
`serializedEntities`, while `actionDelta` is measured on `entityData` and can
include field-path and field-decoder reads. Task 147 loop 27 remains a compact
mismatch signal (`payloadBits: 221`, `actionDelta: 373`), but it does not prove
parser bug, Source 2 semantics, replay corruption, local parser correctness, or
recovery/skip safety. The selected recommendation is
`treat_payloadbits_action_delta_comparison_as_conditional`. No replay was
processed, no parser/engine behavior changed, and no recovery/skip/placeholder
or canonical/source/match output was produced.

## Task 149

Purpose: apply the upstream scalar `char` decoder fix so `char` fields without `count` resolve as `VAR_UINT_32_DECODER` instead of string, then validate authorized replay_010 and replay_011 post-fix with compact metadata only.

Success gate: `upstream_char_decoder_fix_validated`.

Blocked gate: `upstream_char_decoder_fix_blocked`.

Status: completed with the success gate above. The old replay_010 and replay_011 missing-entity blockers are resolved in default post-fix validation. This is a decoder correctness fix, not recovery, skip, placeholder, canonicalization, Source 2 semantics, replay-corruption evidence, or proof of total parser correctness.


## Task 150

Purpose: consolidate the Task 149 upstream scalar `char` decoder fix resolution and close the old replay_010/replay_011 `missing_entity_fail_closed` diagnostic route without processing replays or changing parser behavior.

Success gate: `upstream_char_decoder_fix_resolution_consolidated`.

Blocked gate: `upstream_char_decoder_fix_resolution_blocked`.

Status: completed with the success gate above. The next recommended milestone is `resume_generic_local_replay_pipeline_validation_post_parser_fix`; do not continue the old multi-hypothesis missing-entity route for the resolved boundaries.

## Task 151

Purpose: resume local replay pipeline validation after the upstream scalar
`char` decoder fix resolved the old parser blocker for replay_010 and
replay_011.

Success gate: `post_parser_fix_pipeline_validation_ready`.

Blocked gate: `post_parser_fix_pipeline_validation_blocked`.

Status: completed with the success gate above. Only replay_010 and replay_011
were processed. Both completed default parser advancement to the end, and no
post-parser blocker was found at the parser completion stage. The next
recommended milestone is
`controlled_canonical_source_readiness_task_for_replay_010_and_011`, which
requires separate authorization before any canonical/source/match artifacts or
facts are emitted.

## Task 152

Purpose: validate controlled source/canonical readiness after parser completion
for replay_010 and replay_011 without emitting final facts.

Success gate: `controlled_canonical_source_readiness_validated`.

Blocked gate: `controlled_canonical_source_readiness_blocked`.

Status: completed with the success gate above. Both replay_010 and replay_011
still complete default parser advancement. The readiness classification is
`controlled_canonical_source_readiness_blocked_by_pipeline_wiring`: existing
source-artifact entrypoints are replay_010-oriented and would emit source
artifacts, while no safe compact dry-run/readiness entrypoint for both
authorized canaries or generic canonical dry-run was validated. The next
recommended milestone is
`design_generic_compact_source_canonical_dry_run_entrypoint`.

## Task 153

Purpose: add a preventive read-only upstream check for `Igor-Losev/deadem` so
future parser issues first verify whether a relevant upstream fix already
exists.

Success gate: `upstream_deadem_update_check_added`.

Blocked gate: `upstream_deadem_update_check_blocked`.

Status: completed with the success gate above. The new command is
`npm run check:upstream-deadem`. The Task 153 snapshot classified as
`upstream_check_unavailable` because GitHub could not be reached from this
environment, with recommended action `manual_upstream_check_required`. This is
not evidence that upstream has no update. Future parser debugging should run the
upstream check before starting deep local diagnosis, and any pull, merge,
cherry-pick, rebase, or update must remain a separate explicit task.

## Task 154

Purpose: add a generic compact source/canonical dry-run readiness entrypoint for
replay_010 and replay_011, resolving the Task 152 pipeline-wiring blocker
without emitting final facts.

Success gate: `generic_source_canonical_dry_run_entrypoint_added`.

Blocked gate: `generic_source_canonical_dry_run_entrypoint_blocked`.

Status: completed with the success gate above. The new command is
`npm run dry-run:source-canonical-readiness`. Both replay_010 and replay_011
completed parser advancement in dry-run/readiness mode, output policy passed,
and no first blocker remains. The next recommended milestone is
`emit_controlled_source_canonical_artifacts_for_replay_010_011`, requiring a
separate explicit task before any final source/canonical/match facts are
written.

## Task 155

Purpose: emit controlled compact source/canonical manifest artifacts for
replay_010 and replay_011 after Task 154 readiness.

Success gate: `controlled_source_canonical_artifacts_emitted`.

Blocked gate: `controlled_source_canonical_artifacts_blocked`.

Status: completed with the success gate above. The emitted classes are compact
manifest/audit classes only: `parser_source_summary`,
`source_readiness_manifest`, `canonical_readiness_manifest`,
`source_artifact_manifest`, `canonical_artifact_manifest`,
`schema_validation_summary`, and `output_policy_audit`. Value-bearing source
classes such as timelines, event rows, objective inventories, and reconciliation
rows remain blocked until a future source-class policy review. The next
recommended milestone is
`review_controlled_source_class_policy_before_expanding_artifact_content`.

## Task 156

Purpose: review the Task 155 blocked source classes and define a compact-safe
policy before any richer source/canonical content is emitted.

Success gate: `controlled_source_class_policy_reviewed`.

Blocked gate: `controlled_source_class_policy_blocked`.

Status: completed with the success gate above. No replay was processed and no
final source/canonical/match facts were emitted. The reviewed class policy
selected `death_validation` as the first future class for schema design because
it can remain a compact validation summary. The recommended next milestone is
`design_death_validation_compact_schema`, which must remain schema-first and
must not emit event rows or field values without separate authorization.

## Task 157

Purpose: define the compact schema for `death_validation` before any real
emission of that class.

Success gate: `death_validation_compact_schema_ready`.

Blocked gate: `death_validation_compact_schema_blocked`.

Status: completed with the success gate above. The new schema is
`schemas/death-validation-compact.schema.json`, with synthetic examples and
`tests/death-validation-compact-schema.test.mjs`. The schema is a single object
per replay and forbids event rows, field values, snapshots, attribution, and
gameplay interpretation. The recommended next milestone is
`emit_death_validation_compact_artifact_for_replay_010_011`, in a separately
authorized task.

## Task 158

Purpose: emit the first real compact `death_validation` artifacts for
replay_010 and replay_011 using the Task 157 schema.

Success gate: `death_validation_compact_artifacts_emitted`.

Blocked gate: `death_validation_compact_artifacts_blocked`.

Status: completed with the success gate above. The new command is
`npm run emit:death-validation-compact`. It emitted exactly one
`death_validation.json` per authorized replay:
replay_010 has `eventCount: 45` and `duplicateKeyCount: 0`; replay_011 has
`eventCount: 80` and `duplicateKeyCount: 0`. These are source-observed counter
transition candidate counts only, not final death facts or gameplay
interpretation. Schema validation, output policy audit, and size audit passed.
The recommended next milestone is to review or design the next compact
schema-backed source class before emitting any richer value-bearing content.
