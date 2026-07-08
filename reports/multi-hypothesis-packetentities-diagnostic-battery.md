# Multi-Hypothesis PacketEntities Diagnostic Battery

Gate: `multi_hypothesis_packetentities_diagnostic_battery_ready`

Task 149 ran a compact fail-closed diagnostic battery across synthetic scenarios plus authorized replay_010 and replay_011 only.

## Consolidated Classification

`payloadbits_action_delta_contract_conditional` with `payloadbits_contract_suspected` retained as a live local diagnostic signal.

## Replay Comparison

Replay 010 nearby mismatch count: `0`
Replay 011 nearby mismatch count: `1`
payloadBits/actionDelta mismatch is currently replay_011-specific among the two authorized canaries

## Cursor/Index/Command

simple index formula and two-bit UPDATE command decode remain internally consistent in both canaries, weakening simple index accumulation and command-position bugs while preserving cursor-contract suspicion from high delta and nearby offset alternatives

## PayloadBits/ActionDelta

payloadBits/actionDelta equality is useful in simple comparable cases. replay_010 matched throughout the nearby window, while replay_011 had one pre-boundary mismatch; this keeps the contract conditional and the replay_011 mismatch diagnostic rather than a proven direct skip contract.

## Hypotheses

Strongest: `probe_metric_mismatch_candidate`, `payloadbits_mismatch_is_expected_for_some_field_patterns`, `source_semantics_unknown_candidate`
Weakened: `command_decode_position_suspected`, `index_accumulation_bug_candidate`

## Root Cause Readiness

Readiness: `not_ready_for_parser_fix`
The battery strengthens payloadBits/cursor contract suspicion but does not isolate a technical root cause sufficient for parser behavior design.

## Recommendation

Selected: `design_compact_payloadbits_segment_attribution_probe`
The battery points at payloadBits/actionDelta contract ambiguity while weakening simple index formula and command decode bugs. Because replay_010 matches its nearby window and replay_011 has one mismatch, the next highest-value evidence is compact attribution of actionDelta into field-path and field-reader spans for the mismatching pre-boundary entry.

No recovery, skip, placeholder, continuation, parser fix, default behavior change, raw data, canonical facts, source artifacts, or match facts were produced.
