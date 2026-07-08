# Cursor Index Contract Probe Spec

Gate: `cursor_index_contract_probe_spec_ready`

Recommendation: `design_cursor_index_contract_probe_spec`

Task 146 prepared a non-implementing specification for a future fail-closed
cursor/index/command contract probe around PacketEntities
`missing_entity_fail_closed` boundaries. No replay was processed and no
parser/engine behavior was modified.

## Problem Statement

Task 143 observed replay_010 fail closed at packet 954 loop 33 on UPDATE for
entity 2905, with previousEntityIndex 2717, indexDelta 187, 4852 compact events
tracked, and zero compact target events. Task 144 observed replay_011 fail
closed at packet 1052 loop 28 on UPDATE for entity 5624, with
previousEntityIndex 2681, indexDelta 2942, 41408 compact events tracked, and
zero compact target events.

The shared pattern is an UPDATE for a target entity with no observed prior
local-parser lifecycle history. replay_011 adds the stronger cursor/index
signal because its compact indexDelta is much larger. This is not proof of a
parser bug, Source 2 semantics, replay corruption, or local parser correctness.

## Current Local Contract

The local PacketEntities contract reads `indexDelta` with `readUVarInt`,
accumulates `entityIndex = previousEntityIndex + indexDelta + 1`, then reads a
two-bit command. The command ids map to UPDATE, LEAVE, CREATE, and DELETE.
payloadBits are captured from serializedEntities metadata and can be compared
with actual read-count deltas, but prior tasks showed they cannot be promoted
to a universal skip/cursor contract.

## Future Probe Scope

A future probe should be separately authorized, one replay per task, and
fail-closed at the first missing entity boundary. The spec recommends starting
with replay_011 because indexDelta 2942 is the stronger index/cursor signal.
The probe should collect compact metadata around the boundary and a small
nearby window, then stop without applying the missing UPDATE, skipping payload,
creating an entity, moving the cursor to correct anything, or producing facts.

Allowed compact metadata includes replay id, packet ordinal, loop,
updatedEntries, previousEntityIndex, indexDelta, entityIndex, command id/name,
read counts, entityDataBitLength, payloadBits, local formula checks, and compact
consistency flags. Forbidden data includes raw replay bytes, raw payloads,
raw entityData, raw serializedEntities, string bytes or values, field values,
full send-table payloads, full traces, and canonical/source/match facts.

## Classification Policy

Future classifications are limited to:
`cursor_index_contract_consistent`, `cursor_index_contract_suspected`,
`payloadbits_contract_suspected`, `command_decode_position_suspected`,
`index_delta_high_but_internally_consistent`,
`nearby_offset_alternative_candidate`, and `not_determined`.

Every classification must preserve the limitations: not proof of parser bug,
not Source 2 semantics, not replay corruption, not local parser correctness,
and not permission for recovery, skip, placeholders, parser fixes, or default
behavior changes.

## Decision

The selected option remains `design_cursor_index_contract_probe_spec`. The
next permitted task, if separately authorized, would implement and run a
compact fail-closed replay_011 cursor/index contract probe. This Task 146 does
not authorize that implementation or replay processing.
