# Task 146 - Cursor Index Contract Probe Spec

Status: completed

Gate: `cursor_index_contract_probe_spec_ready`

Commit message: `Design cursor index contract probe spec`

Task 146 produced a non-implementing specification for a future fail-closed
cursor/index/command contract probe around PacketEntities
`missing_entity_fail_closed` boundaries.

The spec consolidates Task 143 replay_010 and Task 144 replay_011 evidence:
both canaries reached an UPDATE for a missing target entity with zero compact
prior local-parser events for that target. replay_011 adds the stronger
cursor/index signal with indexDelta 2942. The spec maps the current local
contract for `indexDelta`, accumulated `entityIndex`, two-bit command decoding,
read-count boundaries, and payloadBits comparison.

Recommended next action: `design_cursor_index_contract_probe_spec`.

Recommended first future canary, only if separately authorized: `replay_011`.

No replay was processed. No parser or engine behavior was modified. No probe,
fix, recovery, skip mode, placeholder entity, continuation, default behavior
change, new opt-in option, canonical output, source artifact, match fact, or
semantic claim was produced.
