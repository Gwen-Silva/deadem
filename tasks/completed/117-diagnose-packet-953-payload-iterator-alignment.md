# Task 117 - Diagnose SerializedEntities Payload Iterator Alignment Around Packet 953

Status: completed

Gate: `local_replay_packet_953_payload_iterator_alignment_diagnosed`

## Objective

Diagnose whether replay_010 packet ordinal 953 `serializedEntities`
payload-size values are aligned to loops 26-29, without parser recovery, parser
fixes, canonical package generation, or match facts.

## Result

The task reused the Task 116 default and opt-in diagnostic failure evidence
without running a new recovery path. Both referenced passes reproduce the Task
105 first failure at missing entity 2905, and recovery remains disabled.

Packet 953 inventory:

- `updatedEntries`: 30
- `payloadSizeCount`: 30
- `serializedEntitiesByteLength`: 43
- `payloadBitsSum`: 5010
- payload-size count equals updated entries: true
- null or undefined payload sizes: false

Loop 26-29 comparison:

- current model loop 26 delta: -280 bits
- current model absolute delta across loops 26-29: 487 bits
- small shifts tested: -2, -1, +1, +2
- no small shift reduced the complete loop 26-29 mismatch
- payloadBits loops 26-29 sum to 428 bits, not loop 26 actual 501 bits
- following payload subset sums for loops 27-29 do not equal the 280
  after-boundary bits
- cumulative residual remains -73 bits by loop 29

Task 116 comparison matched exactly:

- field path 59
- `m_nAvailableHelperCount`
- 288-bit segment
- 36 bytes
- null terminator observed
- 35 bytes before terminator
- 280 bits after the loop 26 expected payload boundary

Conclusion: iterator cardinality supports one payload-size value per updated
entry, but current alignment, small shifts, grouped sums, and nearby cumulative
boundaries do not exactly explain the loop 26/27-29 mismatch. This strengthens
the local payloadBits non-boundary or field-level accounting mismatch
hypothesis while preserving causal conclusion `not_determined`.

## Safety

No field values, string values, string bytes, raw payloads, raw entityData, raw
serializedEntities, full raw send-table payload, canonical package, source
artifact, factual event, snapshot, registry, spatial semantic, mechanic effect,
fight, macro, decision, or ML output was emitted. No recovery was added or
promoted, no fake entity or field was created, and parser default behavior
remains unchanged.

Replay 005, bot fixtures 006-008, candidates 011-020, `samples/**`, and
`output/replays/**` were not used. No Task 118 was created.

## Outputs

- `output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/payload-iterator-gate.json`
- `output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/packet-953-payload-inventory.json`
- `output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/alignment-model-comparison.json`
- `output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/cumulative-boundary-analysis.json`
- `reports/local-replay-packet-953-payload-iterator-alignment.md`

