# Local Replay Entity Lookup Diagnosis

Replay ID: `replay_010`
Input: `.local/deadem/replays/inbox/partida_010.dem`
Gate: `local_replay_entity_lookup_failure_diagnosed`

## Diagnosis

First failing probe: `probe_2_next_tick_only`
First failing operation: `nextTick`
Suspected layer: `parser_advancement`
Next recommended fix scope: `parser_api_investigation`

## Probe Results

- `probe_1_load_only`: passed; operation=none; ticksAdvanced=0; samples=0
- `probe_2_next_tick_only`: failed; operation=nextTick; ticksAdvanced=953; samples=0
- `probe_3_skipped`: skipped; operation=none; ticksAdvanced=0; samples=0
- `probe_4_skipped`: skipped; operation=none; ticksAdvanced=0; samples=0
- `probe_5_skipped`: skipped; operation=none; ticksAdvanced=0; samples=0
- `probe_6_skipped`: skipped; operation=none; ticksAdvanced=0; samples=0
- `probe_7_skipped`: skipped; operation=none; ticksAdvanced=0; samples=0

## Safe Access

Controller primitive fields safe: `null`
Controller handle fields safe: `null`
Pawn primitive fields safe: `null`
Minimal safe snapshot possible: `null`

## Protections

Replay 005 processed: `false`
Bot fixtures processed: `false`
Candidates 011-020 touched: `false`
Parser internals modified: `false`
Branch/source audit passed: `true`

Summary output: `output/local-replay-processing/replay_010-entity-lookup-diagnosis/`
