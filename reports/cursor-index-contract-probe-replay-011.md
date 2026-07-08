# Replay 011 Cursor Index Contract Probe

Gate: `cursor_index_contract_probe_replay_011_ready`

Task 147 implemented and ran a compact fail-closed cursor/index/command contract probe for replay_011 only.

## Boundary

- Packet ordinal: `1052`
- Loop: `28`
- Operation: `UPDATE`
- Entity index: `5624`
- Previous entity index: `2681`
- indexDelta: `2942`
- Local formula: `5624` from 2681 + 2942 + 1
- Formula consistent: `true`
- Command: `UPDATE` (0)
- Command read width: `2` bits

## Classification

Classification: `payloadbits_contract_suspected`

nearby pre-boundary window contains compact comparable payloadBits divergence while read counts remain monotonic

## PayloadBits

PayloadBits: `133`
Action delta: `0`
Comparable: `false`
Interpretation: boundary payloadBits does not match afterAction-afterCommand because no payload action was applied after the missing entity check; nearby-window comparable mismatches are reported separately

## Nearby Offset Summary

Nearby offset alternative found: `true`
Search radius bits: `64`
Plausible candidate count: `104`
Best compact candidate count: `5`

## Hypothesis Impact

Strengthened: `high_index_delta_signal`, `payloadbits_contract_suspected`, `local_formula_and_command_position_internal_consistency`
Weakened: `simple_index_formula_mismatch`, `simple_two_bit_command_position_mismatch`

This output is diagnostic only. It does not prove parser bug, Source 2 semantics, replay corruption, local parser correctness, or authorize recovery, skip, placeholders, parser fixes, default behavior changes, canonical facts, source artifacts, or match facts.
