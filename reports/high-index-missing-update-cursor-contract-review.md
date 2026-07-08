# High-Index Missing UPDATE Cursor Contract Review

Task: 145

Gate: `high_index_missing_update_cursor_contract_reviewed`

Recommended next action: `design_cursor_index_contract_probe_spec`

## Scope

This task consolidated compact outputs from Tasks 143 and 144 and statically
reviewed the local PacketEntities index, cursor, command, and payloadBits
contract. No replay was processed. No parser, engine, or `packages/deadem/**`
file was modified.

## Shared Canary Pattern

Both human canaries fail closed on UPDATE for a missing entity:

| Replay | Packet | Loop | Entity | Previous | indexDelta | Target events | Classification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| replay_010 | 954 | 33 | 2905 | 2717 | 187 | 0 | `never_registered_in_observed_parser_history_candidate` |
| replay_011 | 1052 | 28 | 5624 | 2681 | 2942 | 0 | `index_stream_or_cursor_contract_suspected` |

The common evidence:

- both operations are UPDATE;
- both have missing registry state before and after the boundary;
- both have zero compact prior local-parser target events;
- both fail closed without continuation, recovery, skip, placeholder, fake
  fields, or synthetic registry state.

This is local parser diagnostic evidence only. It does not prove Source 2
semantics, replay corruption, parser correctness, or that either entity never
existed in the game.

## Local Contract

The local PacketEntities loop reads an entity index delta first, then command:

- `indexDelta = bitBuffer.readUVarInt()`
- `entityIndex = previousEntityIndex + indexDelta + 1`
- `command = bitBuffer.readBitsAsUInt(2)`

The command ids map locally as:

- `0`: UPDATE
- `1`: LEAVE
- `2`: CREATE
- `3`: DELETE

UPDATE requires the accumulated entity index to exist in the local registry.
The fail-closed diagnostic records compact metadata and still throws when the
entity is missing.

An error before or during the variable-length index read can affect both the
accumulated entity index and the following two-bit command. An error after the
index but before command could also alter operation interpretation. That makes
cursor/index/command evidence more valuable than another broad replay-wide
ledger pass.

## indexDelta 2942

The replay_011 delta is a strong local suspicion signal because it produces a
large jump from 2681 to 5624. It is not proof of a parser bug by itself.
Possible explanations still include valid encoding, unknown Deadlock/Source 2
semantics, or a prior cursor/command misread. No external oracle has resolved
that ambiguity.

## payloadBits

`payloadBits` are decoded from `serializedEntities` as compact per-entry
metadata. Local normal parsing advances through field extraction/decoders, not
by universally moving `payloadBits`. Prior Task 142 review already warned that
payloadBits must not be treated as a direct skip/cursor contract without more
evidence.

For this reason, this task rejects payloadBits skip/recovery as premature.

## Hypothesis Status

Strengthened:

- `command_decode_or_cursor_alignment_candidate`
- `index_accumulation_bug_candidate`, but only as unproven suspicion
- `never_registered_in_observed_parser_history_pattern`, as local evidence only

Weakened:

- `create_register_path_gap_candidate`
- `registry_state_loss_candidate`

Still open:

- `payload_bits_skip_contract_candidate`
- `source_semantics_unknown_candidate`
- `not_enough_parser_evidence`, narrowed to specific cursor/index gaps

## Recommendation

Select `design_cursor_index_contract_probe_spec`.

Reason: the next useful work is not a fix or recovery. It is a non-implementing
spec for a future fail-closed, compact-only cursor/index probe that defines:

- which nearby offsets can be decoded;
- how command id stability is assessed;
- how payloadBits boundaries are compared without skip;
- what evidence is sufficient to authorize a later one-replay probe.

The future probe, if separately authorized, should be one replay per task,
compact-only, fail-closed, and should not capture raw payloads or field values.

## Rejected Actions

This task rejects direct parser fix, missing UPDATE recovery, payloadBits skip,
placeholder entity, implicit CREATE from UPDATE, and default behavior changes.

## Protections

No replay was processed. Replay 005, replays 006-008, candidates 012-020,
`samples/**`, and `output/replays/**` were not used. No Java, Clarity, external
parser, WSL, iaflow, or Product Reviewer automation was used. No raw replay
bytes, raw payloads, raw entityData, raw serializedEntities, string bytes,
string values, field values, or full send-table payload were versioned.
