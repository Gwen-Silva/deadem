# Task 149 - Multi-Hypothesis PacketEntities Diagnostic Battery

Status: completed

Gate: `multi_hypothesis_packetentities_diagnostic_battery_ready`

Commit message: `Run multi-hypothesis PacketEntities diagnostic battery`

## Summary

Implemented and ran a compact fail-closed diagnostic battery using:

- synthetic payloadBits/actionDelta comparison scenarios;
- replay_010 only until its first `missing_entity_fail_closed`;
- replay_011 only until its first `missing_entity_fail_closed`;
- existing `recovery.diagnoseMissingEntityFailClosed` metadata.

The battery reproduced both expected boundaries:

- replay_010: packet 954 loop 33, UPDATE entity 2905, indexDelta 187;
- replay_011: packet 1052 loop 28, UPDATE entity 5624, indexDelta 2942.

Both boundaries kept the local entity-index formula and two-bit UPDATE command
decode internally consistent. Boundary payloadBits were not comparable because
the parser failed closed before applying missing UPDATE payloads.

Replay comparison:

- replay_010 nearby window mismatch count: 0;
- replay_011 nearby window mismatch count: 1;
- replay_011 loop 27 retained `payloadBits: 221` and `actionDelta: 373`;
- replay_011 remains the stronger cursor/index suspicion canary because of the
  high indexDelta and nearby offset candidates.

Consolidated classification:
`payloadbits_action_delta_contract_conditional`.

Strongest hypothesis after the battery:
`probe_metric_mismatch_candidate`.

Root-cause readiness:
`not_ready_for_parser_fix`.

Recommended next action:
`design_compact_payloadbits_segment_attribution_probe`.

No replay other than replay_010 and replay_011 was processed. No replay was
processed beyond the first missing-entity boundary. No parser/engine behavior
changed. No recovery, skip mode, placeholder entity, fake fields, synthetic
registry state, continuation after missing entity, parser fix, default behavior
change, new opt-in, canonical/source/match output, raw replay bytes, raw
payloads, raw entityData, raw serializedEntities, string bytes, string values,
field values, or full send-table payload was produced.
