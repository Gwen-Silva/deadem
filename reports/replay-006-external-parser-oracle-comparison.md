# Replay 006 External Parser Oracle Comparison

## Objective

Task 052 compared replay 006 against external parser candidates without adding parser skips, placeholders, or semantic recovery. Replay 005 was not processed.

## Candidate Results

| Candidate | Commit | Status | Result |
| --- | --- | --- | --- |
| Igor-Losev/deadem | 207fe497e8bf909a1208ac6b9a62f43b640a781a | executable | Controls 001/002 completed; replay 006 failed with `Unable to find an entity with index [ 5594 ]`. |
| OpenSource-Deadlock-Tools/DemLockSharp | 70c9b5072b192b21a47957de3587223f03c4c140 | source-only | Deadlock-specific WIP; controlled CLI/instrumentation not available in this task. |
| Rupas1k/source2-demo | 9909e369e6f308291ea15ef9e9dfd1206f86956c | source-only | Deadlock support exists, but cargo is unavailable. |
| saul/demofile-net | fd59701a998cf30a46adc4942e063d90de73c07a | blocked | Deadlock parser exists; NuGet restore was allowed, then build failed because the shallow clone lacks version-height history. |

## Upstream Deadem Oracle

The upstream parser is the closest reference implementation. It successfully parsed `partida_001.dem` and `partida_002.dem`, then failed `partida_006.dem` in `DemoMessageHandler.handleSvcPacketEntities` with the same missing entity 5594 error.

This result does not prove protocol correctness, because upstream is related to this fork. It does show that the current replay-006 blocker is not explained by a simple fork-only regression in packet-entity UPDATE handling.

## Tick 3808

Task 051 established the precise current-fork decode:

- tick: 3808
- command sequence: 3880
- message sequence: 14
- message type: svc_PacketEntities
- packet loop index: 29
- decoded entity index: 5594
- operation: UPDATE
- packet classification: delta update
- registry state before operation: missing

Upstream does not expose loop-level diagnostics without local third-party instrumentation, but its failure is in the same UPDATE lookup path and error text.

## Source-Level Comparison

The relevant upstream packet-entity logic uses the same index-delta algorithm and the same operation IDs. Both implementations require UPDATE, LEAVE, and DELETE to resolve an existing entity. The fork adds diagnostic/recovery instrumentation around this path, but no upstream fix or alternate lifecycle behavior was found in the cloned upstream head.

## Decision

Best-supported model: `upstream_inherited_defect`.

This is not a production fix criterion. No independent implementation demonstrated that a missing UPDATE is protocol-tolerated, that an implicit lifecycle event exists before tick 3808, or that the operation should decode differently.

## Gate

`external_oracle_comparison_ready_without_resolution`

## Follow-Up

Created blocked task 053 to complete independent oracle execution once the environment can support either:

- a non-shallow/full-history `demofile-net` checkout, or
- a Rust toolchain for `source2-demo`, or
- a controlled `DemLockSharp` CLI/instrumentation pass.
