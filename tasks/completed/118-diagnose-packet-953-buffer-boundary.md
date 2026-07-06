# Task 118 - Diagnose Packet 953 Post-Loop26 Buffer Boundary And Phantom Entries

Status: completed

Gate: `local_replay_packet_953_buffer_boundary_diagnosed`

## Objective

Diagnose whether replay_010 packet ordinal 953 loops 27-29 are valid entry
reads or cursor/buffer-boundary artifacts after loop 26 consumes nearly all of
the local `entityData` bit window, without parser recovery, parser fixes,
canonical package generation, or match facts.

## Result

The task reused Task 117 default and opt-in diagnostic failure evidence without
running a new recovery path. Both referenced passes reproduce the Task 105
first failure at missing entity 2905, and recovery remains disabled.

Packet 953 boundary inventory:

- `entityDataBitLength`: 5344
- loop 26 after-command read count: 4842
- loop 26 after-action read count: 5343
- field path 59 read span: 5055 to 5343
- remaining bits after loop 26: 1
- packet final read count after loop 29: 5367
- packet final read count relation: exceeds `entityDataBitLength` by 23 bits

Loop classification by read-count bounds:

- loop 27: `padding_or_trailing_bit_reads`
- loop 28: `out_of_buffer_reads`
- loop 29: `out_of_buffer_reads`

Synthetic `BitBuffer` probes used one-byte synthetic buffers, not replay bytes:

- `move` beyond end throws
- `read()` beyond end throws through `_read`
- `readBitsAsUInt` can cross beyond end without throwing
- byte-aligned `readUInt8` at end returns zero and advances
- `readUVarInt` can advance beyond end through `readBitsAsUInt`
- byte-aligned `readUVarInt32` can return zero and advance beyond end through
  `readUInt8`

Conclusion: the evidence strengthens a buffer-boundary artifact hypothesis and
a parser bounds-check hypothesis. It does not prove a parser bug, Source 2
semantics, replay corruption, or a causal fix. Causality remains
`not_determined`.

## Safety

No field values, string values, string bytes, raw payloads, raw entityData, raw
serializedEntities, full raw send-table payload, canonical package, source
artifact, factual event, snapshot, registry, spatial semantic, mechanic effect,
fight, macro, decision, or ML output was emitted. No recovery was added or
promoted, no fake entity or field was created, and parser default behavior
remains unchanged.

Replay 005, bot fixtures 006-008, candidates 011-020, `samples/**`, and
`output/replays/**` were not used. No Task 119 was created.

## Outputs

- `output/local-replay-processing/replay_010-packet-953-buffer-boundary/buffer-boundary-gate.json`
- `output/local-replay-processing/replay_010-packet-953-buffer-boundary/packet-953-boundary-inventory.json`
- `output/local-replay-processing/replay_010-packet-953-buffer-boundary/bitbuffer-boundary-behavior.json`
- `output/local-replay-processing/replay_010-packet-953-buffer-boundary/loops-27-29-boundary-classification.json`
- `reports/local-replay-packet-953-buffer-boundary.md`

