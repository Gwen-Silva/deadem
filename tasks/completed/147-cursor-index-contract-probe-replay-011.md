# Task 147 - Cursor Index Contract Probe Replay 011

Status: completed

Gate: `cursor_index_contract_probe_replay_011_ready`

Commit message: `Implement and run replay 011 cursor index contract probe`

## Summary

Implemented and ran a compact fail-closed cursor/index/command contract probe
on authorized replay_011 only, using the existing
`recovery.diagnoseMissingEntityFailClosed` mode. No new opt-in option was
created.

The expected boundary was reached:

- packetOrdinal: 1052
- loop: 28
- operation: UPDATE
- entityIndex: 5624
- previousEntityIndex: 2681
- indexDelta: 2942
- payloadBits: 133

The local formula was internally consistent:
`2681 + 2942 + 1 = 5624`.

The command read was internally consistent with UPDATE:

- commandId: 0
- commandName: UPDATE
- commandReadBitWidth: 2
- commandReadPosition: 5226

Read counts were monotonic and within entityData. The boundary payloadBits did
not match `afterAction - afterCommand` because the parser stopped fail-closed
before applying the missing UPDATE payload. The nearby five-entry window found
one comparable payloadBits/action-delta divergence at loop 27, while read
counts remained monotonic and within entityData.

Final diagnostic classification:
`payloadbits_contract_suspected`.

High indexDelta remains a compact suspicion signal. Nearby offset alternatives
were recorded only as bounded compact candidates and were not treated as a new
cursor.

No replay other than replay_011 was processed. No recovery, skip mode,
placeholder entity, fake fields, synthetic registry state, continuation after
missing entity, parser fix, default behavior change, canonical/source/match
output, raw replay bytes, raw payloads, raw entityData, raw serializedEntities,
string bytes, string values, field values, or full send-table payload was
produced.
