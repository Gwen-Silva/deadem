# Local Replay Entity Packet Cursor Alignment Diagnosis

Gate: `local_replay_entity_packet_cursor_alignment_diagnosed`
Canary input: `.local/deadem/replays/inbox/partida_010.dem`

## Boundary

Reached Task 107 boundary: `true`
Current tick: `2862`
Boundary error: `entity index out of range`

## Ledger

Window entries captured: `6`
Loop 22 action: `skipped_missing_update_payload`
Loop 22 current skip internally consistent: `true`
Loop 23 action: `create_attempt_out_of_range`
Loop 23 entity index: `570655505`

## Model Comparison

Nearby plausible offsets found: `true`
Plausible candidate count: `97`

## Protection

Canonical package constructed: `false`
Factual artifacts emitted: `false`
Replay 005 processed: `false`
Bot fixtures processed: `false`
Candidates 011-020 touched: `false`
Branch/source audit passed: `true`

Summary output: `output/local-replay-processing/replay_010-entity-packet-cursor-alignment/`

Task 109 was not created.
