# Project State

Last updated: 2026-07-06

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
or hash any replay. Task 100 normalized the user-created `replays/inbox/`
folder into `.local/deadem/replays/inbox/` under
`human_replay_inbox_normalized`, generating local metadata stubs for 11
candidate filenames without reading replay bytes, hashing, copying, parsing, or
processing them. Task 101 then used the explicit authorization to hash those 11
local candidates and attempt the 15-replay batch. It blocked under
`factual_batch_15_candidate_processing_blocked` because no scoped generic
parser/canonicalization command was available for arbitrary local input paths
without moving candidates into forbidden locations or introducing a one-off
workaround. Task 102 created a bounded generic local-input canary for only
`partida_010.dem` and reached
`generic_local_replay_source_artifacts_ready_canonicalization_pending`: source
  artifact generation works from the local path, but generic canonical package
  construction remains pending. Task 103 then attempted the canonical
  source-artifact set for the same single input and blocked under
  `generic_local_replay_canonical_source_artifacts_blocked` because replay
  seek/sampling failed through the current generic `deadem.Player` path with
  `Unable to find an entity with index [ 2905 ]`. Task 104 replaced that
  seek-dependent attempt with a forward-only canary and also blocked under
  `generic_local_replay_forward_source_artifacts_blocked`: parser load
  succeeded and forward advancement produced 15 samples across 953 ticks, but
  the same entity lookup failure occurred during forward sampling. No canonical
  package was constructed. Task 105 then diagnosed the failure under
  `local_replay_entity_lookup_failure_diagnosed`: load-only passed, and
  `nextTick` alone failed after 953 ticks before any entity class lookup, field
  access, pawn/controller relationship resolution, or extractor snapshot logic.
  Task 106 then evaluated a narrow opt-in parser recovery path under
  `local_replay_missing_entity_recovery_partial_progress`: default behavior
  still reproduced the Task 105 failure, opt-in missing-entity recovery advanced
  past that 953-tick blocker to tick 2862, no fake entities or fields were
  materialized, and the run stopped later on `entity index out of range`. Task
  107 then diagnosed that later boundary under
  `local_replay_out_of_range_entity_create_boundary_diagnosed`: the failing
  packet entry was a CREATE at loop 23 of 42 with accumulated entity index
  570655505, class ID 139, serial 35052, and class
  `CCitadel_Ability_Frank_ShockTarget2`; it failed in Entity construction
  before baseline lookup, `registerEntity`, or field extraction. Task 108 then
  diagnosed the packet cursor alignment under
  `local_replay_entity_packet_cursor_alignment_diagnosed`: loop 22 was a
  recovered missing UPDATE for entity 6679, the current relative skip model
  moved from read count 5958 by 266 bits to the loop 23 start at 6224, and that
  arithmetic was internally consistent; however, bounded nearby-offset
  simulation found plausible entity index/command pairs, so cursor
  misalignment remains a viable hypothesis but not a proved cause. Task 109
  then diagnosed serialized entity payload-size semantics under
  `local_replay_serialized_entity_payload_semantics_diagnosed`: in the same
  boundary packet, 21 of 22 present UPDATE entries before the boundary matched
  `payloadBits` to after-command extractor consumption, but loop 21 did not
  (`payloadBits` 227 versus 363 consumed bits). The loop 22 missing UPDATE skip
  remains arithmetic-only evidence because no entity extractor could consume
  that entry independently. Treat `serializedEntities` payloadBits as unsafe
  direct missing-UPDATE skip input until the extractor/proto semantics are
  resolved. Task 110 then investigated the local proto/schema and extractor
  contract under `local_replay_serialized_entities_semantics_investigated`:
  local Deadem, CS2, and Dota 2 protos all identify
  `CSVCMsg_PacketEntities.serialized_entities` only as optional bytes field 13,
  and the `EntityPayloadSizeExtractor` byte-varint contract is local code
  inference rather than schema proof of direct after-command skip semantics.
  Task 109 loop 21 remains contradictory evidence (`payloadBits` 227 versus
  363 consumed bits), and loop 22 remains arithmetic-only evidence. Keep
  missing-UPDATE recovery diagnostic-only pending external/source-engine
  semantics or broader instrumentation. Task 111 then collected a pre-recovery
  default-path baseline under
  `local_replay_pre_recovery_payload_consumption_baseline_ready`: before the
  original Task 105 failure, 1,940 present UPDATE entries were compared, 1,936
  matched after-command consumption, and 4 mismatched before any recovery was
  attempted. This sustains Task 109's mismatch as not solely post-recovery
  contamination and keeps direct missing-UPDATE skip unsafe. Task 112 then
  diagnosed those four packet-953 mismatches under
  `local_replay_pre_recovery_mismatch_field_consumption_diagnosed`: loop 26
  consumed 501 bits through extractor accounting despite `payloadBits` 221,
  while loops 27-29 decoded zero extractor mutations and zero bits at the
  current cursor despite positive payloadBits. This supports a field-level or
  cursor-accounting mismatch, not a Source 2 semantic conclusion or parser fix.
  Task 113 then inspected the loop 26 field-reader segments under
  `local_replay_loop_26_field_reader_segments_diagnosed`: the 7 loop-26 field
  reader segments summed to 448 bits, field-path accounting consumed 53 bits,
  and one 288-bit segment accounted for most of the 280-bit extra consumption.
  Loops 27-29 remained metric-only zero-path/zero-reader updates at the current
  cursor. Causality remains not determined; no field values, raw payloads,
  recovery, canonical package, or factual artifacts were emitted. Task 114 then
  investigated that 288-bit segment's field path 59 decoder contract under
  `local_replay_loop_26_fieldpath_59_decoder_contract_investigated`: the local
  runtime serializer metadata and decoder catalog support
  `m_nAvailableHelperCount` resolving to `decodeString` with `MISC` storage,
  but the numeric/count-style field name keeps serializer mapping or decoder
  assignment as a hypothesis only. The exact runtime varType is not present in
  committed evidence, no local static source/proto declaration was found, and
  no parser bug, Source 2 semantic conclusion, replay corruption conclusion, or
  recovery recommendation was made. Task 115 then captured runtime field
  definition metadata for the same field path under
  `local_replay_loop_26_fieldpath_59_runtime_definition_captured`: field path
  59 resolves locally to runtime varType `char`, classified as string-like,
  making the `decodeString`/`MISC` pairing more coherent in the local runtime
  metadata while keeping the field name convention suspicious and causality
  `not_determined`. Task 116 then diagnosed the `decodeString` string-reader
  accounting for that field path under
  `local_replay_loop_26_string_reader_accounting_diagnosed`: the 288-bit
  segment is a 36-byte local string read that observed a null terminator after
  35 non-null bytes, while 280 bits of the segment sit beyond loop 26's
  `payloadBits` expected boundary. This supports a local payload-boundary or
  accounting mismatch while keeping causality `not_determined`. No field
  values, string values, string bytes, raw payloads, full raw send-table
  payload, parser fix, recovery, canonical package, or factual artifacts were
  emitted. Task 117 then diagnosed packet 953 payload-size iterator alignment
  under `local_replay_packet_953_payload_iterator_alignment_diagnosed`: the
  payload-size count equals `updatedEntries`, contains no null sizes, and
  supports one size per updated entry, but current alignment, small shifts,
  grouped following-payload sums, and nearby cumulative boundaries do not
  exactly explain loop 26 over-consuming while loops 27-29 consume zero. This
  strengthens the local payloadBits non-boundary or field-level accounting
  mismatch hypothesis while preserving causality `not_determined`. No field
  values, string bytes, raw payloads, parser fix, recovery, canonical package,
  or factual artifacts were emitted. Task 118 then diagnosed packet 953
  post-loop26 buffer boundary behavior under
  `local_replay_packet_953_buffer_boundary_diagnosed`: loop 26 ends at read
  count 5343 with `entityDataBitLength` 5344, leaving one bit; loop 27's index
  read crosses the boundary, and loops 28-29 begin beyond it. Synthetic
  `BitBuffer` probes without replay bytes showed some direct read paths can
  advance beyond buffer end without throwing and can return zero-like values.
  This strengthens the buffer-boundary artifact and parser bounds-check
  hypotheses while preserving causality `not_determined`. No field values,
  string bytes, raw payloads, parser fix, recovery, canonical package, or
  factual artifacts were emitted. Task 119 then evaluated an opt-in fail-closed
  PacketEntities boundary guard under
  `local_replay_packet_entities_boundary_guard_diagnosed`: default behavior
  still reproduced the original missing entity 2905 failure, while the guard
  pass stopped first at packet 953 loop 27 `after_index` with read count 5349
  beyond `entityDataBitLength` 5344. The guard prevented loops 27-29 from
  continuing as semantic updates in that diagnostic pass, created no fake
  entity or fields, and remains disabled by default. This strengthens the
  boundary-guard hypothesis only; it is not a parser fix, recovery, Source 2
  semantic conclusion, replay corruption conclusion, canonical package, or
  factual artifact. Task 120 then evaluated an opt-in PacketEntities boundary
  truncation mode under
  `local_replay_packet_entities_boundary_truncation_no_progress`: default
  behavior still reproduced missing entity 2905, the truncation triggered at
  packet 953 loop 27 before reading beyond the boundary and prevented loops
  27-29 from being applied as semantic updates, but the parser still reached
  missing entity 2905 afterward. The result is useful negative evidence: this
  structural truncation alone is not sufficient progress past the original
  failure and remains opt-in, disabled by default, and non-canonical. Task 121
  then macro-diagnosed entity 2905 registry and packet context under
  `local_replay_entity_2905_registry_and_packet_context_diagnosed`: the first
  known reference to entity 2905 is packet ordinal 954 loop 33, already a
  missing UPDATE; the entity was not created, registered, deleted, left, or
  deactivated before that failure in the observed local registry history.
  Nearby indexes 2900-2902 were created and registered normally, packet 954
  read counts stayed within `entityDataBitLength`, and packet 953 truncation
  did not change the entity 2905 registry history. This classifies the failure
  as `first_missing_update_to_never_registered_entity`, not a recovery, parser
  fix, Source 2 semantic conclusion, replay corruption conclusion, canonical
  package, or factual artifact. Task 122 then macro-diagnosed entity-index
  allocation and missing CREATE provenance under
  `local_replay_entity_index_allocation_gap_diagnosed`: indexes 2897-2902,
  including 2900-2902, were observed as CREATE/register entries before the
  failure, while 2903-2910 remained an allocation gap except for the packet
  954 loop 33 missing UPDATE reference to 2905. No CREATE, register attempt,
  class lookup, baseline lookup, or earlier failure stage was observed for
  2905, packet 954 remained locally bounded, and packet 953 truncation did not
  change the allocation/provenance evidence. The bounded classification is
  `never_registered_entity_with_create_gap`; this is still not a parser fix,
  recovery, Source 2 semantic conclusion, replay corruption conclusion,
  canonical package, or factual artifact. Task 123 then triaged external parser
  prior art and a second local canary under
  `replay_parser_prior_art_and_second_canary_triage_ready`: four mature public
  parser repositories were inspected in local-only shallow clones, no inspected
  PacketEntities path showed implicit CREATE for an UPDATE to a never-registered
  entity, and replay_011 reproduced the same missing-entity lookup failure
  class after a minimal bounded probe. The blocker is classified as a local
  replay class issue rather than replay_010-only evidence, and the recommended
  next action is an external oracle comparison before further local parser
  intervention. No parser default behavior, recovery, canonical package, match
  facts, external source tree, raw replay bytes, `.dem`, or `.local` files were
  committed. Task 124 then evaluated external parser oracle feasibility under
  `external_parser_oracle_canaries_ready`: `skadistats/clarity` is the only
  inspected local clone with Deadlock support, but the practical oracle probe
  blocked on local Java/runtime setup before any canary execution; `manta`,
  `demoparser`, and `demoinfocs-golang` did not show practical Deadlock
  support in the inspected local evidence. No external parser contradicted or
  confirmed the local missing-entity behavior because no practical canary
  oracle ran. The recommended next action is
  `manual_external_oracle_setup_needed`.

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
authorized expansion attempt, Task 099 prepared human replay intake, and Task
  100 normalized local candidate filenames into the ignored inbox, Task 101
  blocked candidate processing, Task 102 validated the first generic local-input
  parser canary, Task 103 blocked on seek-dependent source-artifact extraction,
  and Task 104 confirmed that a forward-only canary still reaches the same
  parser entity-index blocker. Task 105 localized the blocker to `nextTick`
  parser advancement itself, and Task 106 showed opt-in missing-entity recovery
  makes partial progress but does not finish the replay. Task 107 diagnosed the
  later out-of-range CREATE boundary before baseline lookup, entity
  registration, or field extraction. Task 108 diagnosed cursor alignment around
  loop 22/23 and showed current skip arithmetic is internally consistent while
  nearby plausible offsets exist. Task 109 confirmed loop 21 payload-size
  mismatch and classified direct missing-UPDATE payload skipping as unsafe.
  Task 110 confirmed local schema evidence is insufficient to validate direct
  skip semantics and recommended diagnostic-only recovery while external
  proto/engine semantics or broader instrumentation remain unresolved. Task
  111 confirmed mismatches occur before any recovery on the default path. Task
  112 confirmed the target mismatch loops are field-level/cursor-accounting
  evidence, with loop 26 over-consuming and loops 27-29 consuming zero bits at
  the current cursor. Task 113 isolated the largest loop-26 field-reader
  segment, and Task 114 confirmed the local decoder/storage contract for field
  path 59 while preserving uncertainty about causality. Stop for a human
  milestone decision about whether to capture runtime send-table field
  definition metadata without values, compare an independent parser/oracle
  serializer view, investigate external serializedEntities semantics or the
  entity-index stream boundary further, wire local-input canonicalization after
  that blocker is resolved, improve cache tooling, revisit spatial evidence
  only with genuinely new evidence, improve mechanics/build mapping, or defer
  toward local AI/runtime benchmarking later.

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

## Task 126 Process Restoration Note

Task 126 attempted to restore the direct GPT -> Codex workflow after the
abandoned iaflow/Product Reviewer/WSL automation route. The tracked iaflow
automation was removed by a non-destructive reverse patch under
`direct_codex_workflow_restored`.
This is not parser progress.

## Task 127 Strategy Decision Note

Task 127 selected `add_diagnostic_fail_closed_review_next` under
`independent_missing_entity_strategy_ready`. The decision package consolidates
the repeated replay_010/replay_011 missing-entity blocker, static prior-art
evidence, and the unavailable Clarity runtime path. It does not authorize
recovery, skip mode, placeholders, parser fixes, default behavior changes,
external parser execution, Java setup, or new replay processing.

## Task 128 Diagnostic Contract Review Note

Task 128 reviewed the diagnostic fail-closed missing-entity contract under
`diagnostic_fail_closed_missing_entity_contract_ready`. The review defines
diagnostic fail-closed as a possible future diagnostic-only stop at the first
PacketEntities missing-entity boundary with compact metadata and no
continuation, recovery, skip mode, placeholder entity, parser fix, canonical
facts, or default behavior change. It does not authorize implementation; any
future implementation requires a new human-authored task.

## Task 129 Diagnostic Fail-Closed Implementation Note

Task 129 implemented a disabled-by-default diagnostic fail-closed missing-entity
metadata hook under `diagnostic_fail_closed_missing_entity_implemented`. The
option is `recovery.diagnoseMissingEntityFailClosed`; default parser behavior
remains unchanged. The diagnostic records compact boundary metadata at the
existing missing-entity failure point and still fails closed without recovery,
skip mode, placeholder entities, fake fields, synthetic registry state,
continuation, canonical facts, or Source 2/replay-corruption/parser-correctness
claims. Validation used synthetic handler fixtures; no replay was processed.

## Task 130 Diagnostic Config Isolation Note

Task 130 hardened the Task 129 diagnostic option under
`diagnostic_fail_closed_config_isolation_ready`. When
`recovery.diagnoseMissingEntityFailClosed` is true, `ParserConfiguration`
rejects `allowUnresolvedEntityReference`, `allowMissingClassBaseline`, and
`allowEntityPacketBoundaryTruncation` so the missing-entity diagnostic remains
isolated from recovery and continuation-oriented modes. Default behavior is
unchanged, and validation used synthetic tests only; no replay was processed.

## Task 131 Replay 010 Diagnostic Canary Note

Task 131 ran the authorized replay_010-only canary under
`diagnostic_fail_closed_replay_010_canary_ready`. Default behavior still fails
with `Unable to find an entity with index [ 2905 ]`. With only
`recovery.diagnoseMissingEntityFailClosed: true`, the parser records one compact
`missing_entity_fail_closed` diagnostic at packet ordinal 954 loop 33 and still
throws without recovery, skip, placeholder/fake entity, field materialization,
payload skip, update application, canonical output, or continuation. No replay
other than replay_010 was accessed or processed.

## Task 132 Replay 011 Diagnostic Canary Note

Task 132 ran the authorized replay_011-only canary under
`diagnostic_fail_closed_replay_011_canary_ready`. Default behavior still fails
with `Unable to find an entity with index [ 5624 ]`. With only
`recovery.diagnoseMissingEntityFailClosed: true`, the parser records one compact
`missing_entity_fail_closed` diagnostic at packet ordinal 1052 loop 28 and
still throws without recovery, skip, placeholder/fake entity, field
materialization, payload skip, update application, canonical output, or
continuation. No replay other than replay_011 was accessed or processed.

## Task 133 Dual Missing Entity Diagnostic Canary Consolidation

Task 133 consolidated the compact replay_010 and replay_011 diagnostic canary
evidence under `dual_missing_entity_diagnostic_canaries_consolidated`. Both
canaries reproduce the `missing_entity_fail_closed` class: replay_010 at packet
954 loop 33 for entity 2905, and replay_011 at packet 1052 loop 28 for entity
5624. The consolidation selected
`request_human_decision_for_parser_intervention_design` as the next route,
without processing replays, changing parser/engine behavior, recommending
recovery/skip/placeholder behavior, or making Source 2/replay-corruption/local
parser correctness claims.

## Task 134 Missing Entity Parser Intervention Design Review

Task 134 reviewed possible future parser-intervention design boundaries under
`missing_entity_parser_intervention_design_ready`. It selected
`prepare_bounded_parser_intervention_spec_for_human_approval` as the next
route. The review defines the minimum problem as PacketEntities UPDATE
commands for entity indexes missing from the local registry, but does not
authorize implementation, recovery, skip mode, placeholder entities, parser
fixes, default behavior changes, new opt-in behavior, replay processing,
canonical/source/match outputs, or Source 2/replay-corruption/local parser
correctness claims.

## Task 135 Missing Entity Bounded Parser Intervention Spec

Task 135 prepared a bounded, non-implementing future-intervention spec under
`missing_entity_bounded_parser_intervention_spec_ready`. The selected proposed
future intervention is `diagnostic_index_lifecycle_probe_only`: a diagnostic
index/lifecycle probe that would preserve fail-closed throwing and compact
metadata boundaries if separately approved later. Task 135 does not authorize
implementation, parser/engine changes, replay processing, recovery, skip mode,
placeholder entities, default behavior changes, new opt-in behavior,
canonical/source/match outputs, or semantic claims.

## Task 136 Missing Entity Index Lifecycle Probe Implementation

Task 136 implemented the separately authorized
`diagnostic_index_lifecycle_probe_only` extension under
`missing_entity_index_lifecycle_probe_ready`. The existing
`recovery.diagnoseMissingEntityFailClosed` mode now records compact
packet-local lifecycle evidence and conservative classification metadata
(`not_determined` when evidence is insufficient) while preserving the same
fail-closed missing-entity throw. No new opt-in option, default behavior
change, recovery, skip mode, placeholder, fake fields, synthetic registry
state, parser continuation, replay processing, or canonical/source/match
output was added.

## Task 137 Replay 010 Index Lifecycle Probe Canary

Task 137 ran the approved diagnostic index/lifecycle probe on replay_010 only
under `missing_entity_index_lifecycle_probe_replay_010_canary_ready`. The
diagnostic pass used only `recovery.diagnoseMissingEntityFailClosed: true` and
captured the known packet 954 loop 33 missing UPDATE for entity 2905 with the
new lifecycle/classification fields present. The observed classification is
`not_determined` because the compact packet-local evidence has no prior
same-entity entry but does not establish replay-wide lifecycle or index-stream
cause. The parser still throws fail-closed, and no recovery, skip,
placeholder, fake fields, synthetic registry state, continuation, default
behavior change, raw data versioning, or canonical/source/match output was
introduced.

## Task 138 Replay 011 Index Lifecycle Probe Canary

Task 138 ran the approved diagnostic index/lifecycle probe on replay_011 only
under `missing_entity_index_lifecycle_probe_replay_011_canary_ready`. The
diagnostic pass used only `recovery.diagnoseMissingEntityFailClosed: true` and
captured the known packet 1052 loop 28 missing UPDATE for entity 5624 with the
new lifecycle/classification fields present. The observed classification is
`not_determined` because the compact packet-local evidence has no prior
same-entity entry but does not establish replay-wide lifecycle or index-stream
cause. The parser still throws fail-closed, and no recovery, skip,
placeholder, fake fields, synthetic registry state, continuation, default
behavior change, raw data versioning, or canonical/source/match output was
introduced.

## Task 139 Index Lifecycle Probe Canary Consolidation

Task 139 consolidated the Task 137 and Task 138 index lifecycle probe canaries
under `index_lifecycle_probe_canaries_consolidated`. Both canaries remain
`classificationCandidate: not_determined`: replay_010 stopped fail-closed at
packet 954 loop 33 UPDATE entity 2905, and replay_011 stopped fail-closed at
packet 1052 loop 28 UPDATE entity 5624. The shared evidence is packet-local
only and cannot establish replay-wide lifecycle, create/register/removal
provenance, or index-stream cause. Task 139 did not process replays, modify
parser/engine code, create recovery/skip/placeholder behavior, or emit
canonical/source/match/raw outputs. The selected next action is
`prepare_replay_wide_lifecycle_diagnostic_spec_for_human_approval`, a future
spec-only route if separately authorized.

## Task 140 Replay-Wide Lifecycle Diagnostic Spec

Task 140 prepared a bounded, non-implementing replay-wide lifecycle diagnostic
spec under `replay_wide_lifecycle_diagnostic_spec_ready`. The selected
alternative is `design_replay_wide_entity_lifecycle_ledger`: a future
diagnostic-only route that would collect compact parser-local lifecycle and
registry metadata up to the first `missing_entity_fail_closed` boundary if
separately approved. Task 140 does not authorize implementation, replay
processing, parser/engine changes, recovery, skip mode, placeholders, default
behavior changes, canonical/source/match outputs, or semantic claims.

## Task 141 Replay-Wide Lifecycle Diagnostic Ledger Implementation

Task 141 implemented the approved diagnostic-only replay-wide/local-parser
lifecycle ledger under `replay_wide_lifecycle_diagnostic_implemented`, using
only synthetic validation. The existing
`recovery.diagnoseMissingEntityFailClosed` mode now records compact lifecycle
metadata before the first missing entity boundary and includes diagnostic
classification fields such as `not_determined`,
`created_then_missing_registry_state_candidate`, and
`removed_before_missing_update_candidate`. The mode remains disabled by
default and still throws fail-closed. No replay was processed, no new opt-in
option was created, and no recovery, skip mode, placeholder, continuation,
default behavior change, canonical/source/match output, or semantic claim was
introduced.

## Task 142 PacketEntities Missing Entity Parser Mechanism Review

Task 142 completed a static parser mechanism review under
`packetentities_missing_entity_parser_mechanism_reviewed`. The review mapped how
`handleSvcPacketEntities` accumulates entity indexes, reads two-bit commands,
routes UPDATE/LEAVE/CREATE/DELETE, performs registry lookups, registers CREATEs,
deactivates LEAVEs, deletes DELETEs, and uses `serializedEntities` payload
sizes. It identified plausible local hypotheses including create/register gaps,
registry state loss, delete/leave semantics gaps, command/cursor alignment, and
payloadBits contract uncertainty, without promoting any hypothesis to a parser
bug, Source 2 semantic, replay corruption claim, or game fact. No replay was
processed and no parser behavior changed. The next safe evidence remains a
future authorized run of the existing Task 141 fail-closed replay-wide lifecycle
ledger on one canary at a time.

## Task 143 Replay 010 Replay-Wide Lifecycle Diagnostic Canary

Task 143 ran the existing fail-closed replay-wide/local-parser lifecycle ledger
on authorized `replay_010` only. Both default and diagnostic passes reproduced
`Unable to find an entity with index [ 2905 ]`, stopping at packet ordinal 954,
loop 33, operation UPDATE, previousEntityIndex 2717, indexDelta 187, and
payloadBits 193. The ledger tracked 4852 compact local-parser events before the
boundary and zero compact events for entity 2905, yielding
`never_registered_in_observed_parser_history_candidate`. This means only that
entity 2905 was not observed in local parser history before the missing UPDATE;
it is not a claim that the entity never existed in game. No parser/engine
behavior changed, no recovery/skip/placeholder/continuation was used, and no
raw/canonical/source/match output was produced.

## Current Direction

Use `docs/FIVE_REPLAY_PILOT_PLAN.md` for the finite pilot plan and
`docs/NEXT_MILESTONE.md` for the active milestone. Task 106 is complete with
partial opt-in missing-entity recovery progress for replay_010, Task 107 is
complete with a bounded diagnosis of the subsequent out-of-range CREATE
boundary, Task 108 is complete with a bounded cursor-alignment diagnosis around
that boundary, Task 109 is complete with a bounded serialized payload-size
semantics diagnosis, and Task 110 is complete with a bounded local
serializedEntities schema/extractor semantics investigation. Task 111 is
complete with a bounded pre-recovery payload-consumption baseline. Task 112 is
complete with a bounded field-consumption diagnosis of the same packet-953
mismatches. Task 113 is complete with bounded field-reader segment accounting
for loop 26. Task 114 is complete with bounded field path 59 decoder/serializer
contract investigation. Task 115 is complete with bounded runtime field
definition metadata capture for field path 59. Task 116 is complete with
bounded string-reader and payload-boundary accounting for the same field path.
Task 117 is complete with bounded payload-size iterator alignment diagnosis
for packet 953. Task 118 is complete with bounded post-loop26 buffer-boundary
diagnosis for packet 953. Task 119 is complete with bounded opt-in
  PacketEntities boundary-guard evaluation for packet 953. Task 120 is complete
  with bounded opt-in PacketEntities boundary-truncation evaluation for packet
  953, ending in no progress past missing entity 2905. Task 121 is complete
  with bounded registry lifecycle and packet-954 context diagnosis for entity
  2905, classifying the first missing update as a never-registered entity in
  the observed local evidence. Task 122 is complete with bounded entity-index
  allocation and CREATE-provenance diagnosis around entity 2905, classifying
  the failure as `never_registered_entity_with_create_gap`. Task 123 is
  complete with external prior-art and replay_011 second-canary triage,
  classifying the current blocker as a local replay class issue and
  recommending an external oracle comparison. Task 124 is complete with a
  bounded external parser oracle feasibility evaluation and recommends manual
  local-only setup before another oracle run. Task 125 then decided Clarity
  oracle viability under `clarity_oracle_viability_decided`: the final category
  is `oracle_inviavel_no_ambiente_atual` because Java/JDK is not available in
  the current environment and no obvious replay execution path exists without a
  wrapper/adaptation step. This negative result does not prove the local parser
  is correct and does not prove replay corruption or Source 2 semantics. Task
  126 restored the direct GPT -> Codex workflow. Task 127 then selected
  `add_diagnostic_fail_closed_review_next` as the next bounded local route.
  Task 128 reviewed that route as a diagnostic fail-closed contract only,
  without parser changes, implementation authorization, or recovery/skip
  design. Task 129 implemented the separately authorized disabled-by-default
  diagnostic metadata hook and preserved fail-closed/no-continuation behavior
  using synthetic tests rather than replay processing. Task 130 then hardened
  the configuration boundary so the diagnostic cannot be combined with
  missing-entity recovery, missing-baseline recovery, or entity packet boundary
  truncation. Task 131 then confirmed the diagnostic on the authorized
  replay_010 canary: the real first missing-entity boundary is packet 954 loop
  33 for entity 2905, and the parser still fails closed without continuation.
  Task 132 confirmed the same diagnostic class on the authorized replay_011
  canary: packet 1052 loop 28 for entity 5624, again fail-closed without
  continuation. Task 133 consolidated both canaries and selected
  `request_human_decision_for_parser_intervention_design` as the next bounded
  route, with no replay processing or parser changes. Task 134 then reviewed
  parser-intervention design boundaries and selected
  `prepare_bounded_parser_intervention_spec_for_human_approval` as a
  non-implementing next step. Task 135 prepared that bounded spec and selected
  `diagnostic_index_lifecycle_probe_only` for future human approval, again
  without implementation or replay processing. Task 136 then implemented that
  approved diagnostic-only lifecycle probe extension synthetically, preserving
  fail-closed behavior and adding no recovery, skip, placeholders, default
  behavior change, replay processing, or semantic claims. Task 137 then ran
  that lifecycle probe on the authorized replay_010 canary and observed
  `classificationCandidate: not_determined` at packet 954 loop 33 for entity
  2905, with fail-closed behavior preserved and no raw/canonical output. Task
  138 then ran the same lifecycle probe on the authorized replay_011 canary and
  observed `classificationCandidate: not_determined` at packet 1052 loop 28 for
  entity 5624, again preserving fail-closed behavior with no raw/canonical
  output. Task 139 consolidated both lifecycle probe canaries and selected
  `prepare_replay_wide_lifecycle_diagnostic_spec_for_human_approval` as the
  next bounded route because packet-local evidence is insufficient to decide
  replay-wide lifecycle or index-stream cause. Task 140 prepared that bounded
  non-implementing spec and selected
  `design_replay_wide_entity_lifecycle_ledger` as the future route requiring
  separate human approval before any implementation or replay processing. Task
  141 then implemented that diagnostic-only ledger with synthetic validation,
  preserving disabled-by-default fail-closed behavior and adding no recovery,
  skip, placeholder, continuation, default behavior change, or replay
  processing. Task 142 reviewed the local PacketEntities missing-entity
  parser mechanism and recommended a future authorized fail-closed canary of
  the existing replay-wide lifecycle ledger. Task 143 then ran that ledger on
  authorized replay_010 only, reproducing packet 954 loop 33 UPDATE missing
  entity 2905 with 4852 compact events tracked, zero target events, and
  classification `never_registered_in_observed_parser_history_candidate`.
  Task 144 then ran the same ledger on authorized replay_011 only, reproducing
  packet 1052 loop 28 UPDATE missing entity 5624 with 41408 compact events
  tracked, zero target events, and classification
  `index_stream_or_cursor_contract_suspected` because of compact cursor/index
  metadata including indexDelta 2942. These are local parser diagnostic
  observations only; they do not establish Source 2 semantics, replay
  corruption, or parser correctness. Task 145 then consolidated replay_010 and
  replay_011 and statically reviewed the local PacketEntities
  index/cursor/command/payloadBits contract. The review selected
  `design_cursor_index_contract_probe_spec` as the next non-implementing route:
  define compact fail-closed cursor/index evidence before any future replay
  probe or parser intervention. Task 146 then prepared that non-implementing
  cursor/index contract probe spec and selected replay_011 as the first future
  canary only if separately authorized, because replay_011 has the stronger
  index/cursor signal with indexDelta 2942. The spec remains compact-only and
  fail-closed, and does not authorize replay processing, parser/engine changes,
  recovery, skip, placeholders, default behavior changes, or semantic claims.
  Task 147 then implemented and ran that compact fail-closed probe on
  authorized replay_011 only. The expected packet 1052 loop 28 UPDATE missing
  entity 5624 boundary was reached; the local formula
  `2681 + 2942 + 1 = 5624` and two-bit UPDATE command position were internally
  consistent, while the nearby pre-boundary window showed one compact
  payloadBits/action-delta divergence. The diagnostic classification is
  `payloadbits_contract_suspected`, with high indexDelta and nearby offset
  alternatives retained as investigation signals only. The parser still failed
  closed with no recovery, skip, placeholder, continuation, default behavior
  change, raw data, canonical/source/match output, or semantic conclusion.
