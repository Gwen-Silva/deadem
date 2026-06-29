# Parser Compatibility Matrix

Date: 2026-06-29

## Scope

Task 046 compared default parser behavior and already implemented diagnostic recoveries across local Deadlock replays, excluding replay 005. It did not add class-891 recovery, process video, or perform semantic gameplay analysis.

## Inventory

- Replays discovered: partida_001.dem, partida_002.dem, partida_003.dem, partida_004.dem, partida_005.dem, partida_006.dem
- Eligible replays: partida_001.dem, partida_002.dem, partida_003.dem, partida_004.dem, partida_006.dem
- Replay 005 excluded: true
- Direct build metadata: {"unavailable":["replay_001","replay_002","replay_003","replay_004","replay_006"]}
- Direct map metadata: {"unavailable":["replay_001","replay_002","replay_003","replay_004","replay_006"]}

## Results

- Default parser completions: 4/5
- Diagnostic recovery completions: 4/5
- Deterministic rerun: passed
- Failure categories: none, entity_not_found, class_not_found
- Best-supported compatibility model: `single_replay_corruption`
- Corpus diversity: `insufficient_direct_build_protocol_diversity`

## Replay 006

Replay 006 remains blocked at the 3807/3808 boundary. The exposed sequence is entity 5594 missing UPDATE, baseline 709 missing before CREATE, then class 891 after limited recovery. This is treated as a parser/protocol compatibility boundary, not a request for another serial skip.

## Structural Pass Feasibility

Current code does not expose a metadata/envelope-only pass without entity materialization. A blocked task was created for `047-implement-structural-replay-stream-pass-without-entity-materialization`.

## Controlled Replay Recommendation

The corpus lacks direct build/protocol diversity. A short controlled replay packet should include spawn idle, two-lane movement, zipline use, NPC/structure damage, one death, respawn, one neutral-objective interaction, and a 5-10 minute duration.

## Gate

`parser_compatibility_matrix_ready_with_insufficient_diversity`
