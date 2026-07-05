# Local Replay Serialized Entity Payload Semantics Diagnosis

Gate: `local_replay_serialized_entity_payload_semantics_diagnosed`
Canary input: `.local/deadem/replays/inbox/partida_010.dem`

## Boundary

Reached Task 107/108 boundary: `true`
Current tick: `2862`
Boundary error: `entity index out of range`

## Payload Consumption

Window entries captured: `6`
Loop 21 payloadBits: `227`
Loop 21 actual after-command consumption: `363`
Loop 21 mismatch confirmed: `true`
Loop 22 semantic status: `not_independently_justified`
Present UPDATE mismatches before boundary: `1`
Closest tested reference: `after_command`
Direct missing UPDATE skip assessment: `unsafe`

## Recommendation

investigate EntityPayloadSizeExtractor and serializedEntities proto semantics before using payloadBits as missing UPDATE skip input

## Protection

Canonical package constructed: `false`
Factual artifacts emitted: `false`
Replay 005 processed: `false`
Bot fixtures processed: `false`
Candidates 011-020 touched: `false`
Branch/source audit passed: `true`

Summary output: `output/local-replay-processing/replay_010-serialized-entity-payload-semantics/`

Task 110 was not created.
