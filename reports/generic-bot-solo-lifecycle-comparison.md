# Generic Bot/Solo Lifecycle Comparison

## Summary

Task 055 compares the two build-23916427 solo-bot failures against the same-build normal replay without adding parser recovery. The diagnostic wrapper invokes the production `handleSvcPacketEntities` path first and uses bounded independent envelope decoding only as supporting evidence.

## Failure normalization

- replay_007: invalid_entity_index; raw=269035851; boundedIndex=10571; operation=update; classification=raw_value_exceeds_14_bit_index_possible_packed_handle_or_decoder_desync
- replay_008: missing_entity_leave; raw=4436; boundedIndex=4436; operation=leave; classification=bounded_entity_index
- replay_009: none; raw=null; boundedIndex=null; operation=null; classification=not_applicable

Replay 007 is not classified as a normal missing-entity lifecycle failure because the reported value exceeds the documented 14-bit entity-index range. Replay 008 is a bounded missing LEAVE, which is distinct from replay 006's missing UPDATE.

## Independent decode

- replay_007: production_failure_not_reproduced_by_envelope_scan; exact loop available=false
- replay_008: production_failure_not_reproduced_by_envelope_scan; exact loop available=false
- replay_009: not_applicable_completed; exact loop available=false

## Initialization and delta-chain evidence

- replay_007: completed=false; finalTick=18; svc_PacketEntities=19; full/non-delta=0; delta=19
- replay_008: completed=false; finalTick=3480; svc_PacketEntities=3482; full/non-delta=0; delta=3482
- replay_009: completed=true; finalTick=138925; svc_PacketEntities=138936; full/non-delta=0; delta=138936

- replay_007: failingDeltaFrom=346; classification=delta_update; conclusion=delta_base_semantics_not_confirmed_by_current_parser_state
- replay_008: failingDeltaFrom=3778; classification=delta_update; conclusion=delta_base_semantics_not_confirmed_by_current_parser_state
- replay_009: failingDeltaFrom=null; classification=null; conclusion=no_failure

## Entity provenance

- replay_007: searched=10571; result=no_prior_lifecycle_found_in_limited_scan; priorCreates=0
- replay_008: searched=4436; result=no_prior_lifecycle_found_in_limited_scan; priorCreates=0
- replay_009: searched=null; result=not_applicable_completed; priorCreates=0

## Bot-specific comparison

Replay 009 completed on the same user-provided build, so build 23916427 is not broadly incompatible under current evidence. Class/message semantic differences remain incomplete because both bot replays fail before full telemetry can be reconstructed.

## Hypotheses

- H1: partially_supported - replay 007 raw value is a packed handle misused as index. reported value 269035851 exceeds 14-bit entity index; bounded component is 10571; independent packet scan did not prove handle semantics
- H2: partially_supported - replay 007 packet-entity bit cursor is desynchronized. production reported a value outside entity-index bounds, but the exact first bit disagreement remains unresolved
- H3: partially_supported - replay 007 error instrumentation reports the wrong field. independent envelope scan did not reproduce the production lookup value before serializer-dependent decoding
- H4: not_supported - replay 007 and 008 share missing prior entity creation. normalized signatures: replay_007=invalid_entity_index, replay_008=missing_entity_leave
- H5: not_testable - replay 007 and 008 depend on an unprocessed initial snapshot. delta base semantics and exact initial snapshot ownership are not exposed by current diagnostics
- H6: partially_supported - solo-bot demos begin from a delta state without full registry population. both solo-bot controls fail while same-build normal replay completes; precise shared mechanism is not confirmed
- H7: partially_supported - parser mishandles bot-mode sign-on or state refresh. mode association is supported, but replay 007 and 008 failure signatures differ
- H8: not_testable - bot-controller entities use a lifecycle path absent in normal matches. class/serializer semantic identity was not available before both failures
- H9: not_supported - replay 008 is equivalent to replay 006. replay_008=missing_entity_leave; replay_006 was missing_entity_update, so equivalence is not supported by normalized signature
- H10: supported - replay 007 and replay 008 are unrelated failures. replay_007=invalid_entity_index; replay_008=missing_entity_leave
- H11: supported - replay 009 proves build 23916427 is generally supported. same-build normal human replay completed with default parser
- H12: supported - quit termination is irrelevant because replay 008 fails before termination. replay_008 first failure tick 3480; match termination occurs later by user metadata

## Causal chain

distinct_observable_failures_no_single_causal_chain_confirmed

## Validation

- replay_007: deterministic=true; a78d77a69f12 / a78d77a69f12
- replay_008: deterministic=true; 4f5609f87c0c / 4f5609f87c0c

Replay 005 was excluded. No production parser fix was included.

## Gate

bot_solo_failures_are_distinct

## Follow-up

task_053_reframed_to_ask_whether_external_parsers_report_replay_007_raw_value_as_index_handle_or_decode_desync_and_whether_replay_008_missing_leave_has_an_external_lifecycle_explanation

