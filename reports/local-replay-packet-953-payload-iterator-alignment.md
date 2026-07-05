# Replay 010 Packet 953 Payload Iterator Alignment

Task 117 diagnosed packet ordinal 953 payload-size iterator alignment using committed Task 111-116 diagnostics. It did not add recovery, modify parser behavior, build a canonical package, or emit match facts.

## Inventory

- updatedEntries: 30
- payloadSizeCount: 30
- serializedEntitiesByteLength: 43
- payloadBitsSum: 5010
- iterator cardinality supports one-size-per-entry: true

## Loop 26-29 Model Results

- current alignment explains loop 26: no
- any small shift reduces mismatch for loops 26-29: no
- following payload subset equals the 280 after-boundary bits: no
- grouped payload hypothesis: not_strengthened
- cumulative nearby boundary exact match: false

## Task 116 Comparison

- 288-bit string segment matched: true
- null terminator observed: true
- bits after loop 26 expected boundary: 280
- field values, string values, string bytes, and raw payloads were not emitted.

## Conclusion

The local metrics support payload iterator cardinality as one size per updated entry, while no small shift, grouped sum, or nearby cumulative boundary exactly explains loop 26 consuming beyond its payloadBits and loops 27-29 consuming zero. The safest conclusion remains not_determined; this strengthens a payloadBits non-boundary or field-level accounting mismatch hypothesis, not a parser fix or recovery rule.

Gate: local_replay_packet_953_payload_iterator_alignment_diagnosed
