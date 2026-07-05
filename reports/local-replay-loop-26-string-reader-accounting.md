# Local Replay Loop 26 String Reader Accounting

Gate: `local_replay_loop_26_string_reader_accounting_diagnosed`

## Scope

This diagnostic is limited to replay_010 packet ordinal 953, loop 26, field path 59. It records string-reader accounting and payload-boundary metrics only. It does not record string values, string bytes, raw payloads, entityData, serializedEntities, snapshots, canonical artifacts, or match facts.

Default failure reproduced: `true`
Diagnostic failure reproduced without recovery: `true`
Recovery added or promoted: `false`

## String Reader Segment

Field path: `59` / `m_nAvailableHelperCount`
Runtime varType: `char`
Decoder/storage: `decodeString` / `MISC`
Read-count span: `5055-5343`
Bits consumed: `288`
Bytes consumed: `36`
Null terminator observed: `true`
Bytes before terminator: `35`
Stopped because: `null_terminator`
Value recorded: `false`
Raw bytes recorded: `false`

## Payload Boundary

Loop 26 after-command read count: `4842`
Loop 26 payload bits: `221`
Expected payload end: `5063`
Segment starts before expected end: `true`
Segment ends after expected end: `true`
Bits before expected end inside segment: `8`
Bits after expected end inside segment: `280`
Loops 27-29 payload bits sum: `207`
Following payload window relation: `metric_possible_not_causal`

## Well-Formedness

ReadString terminated locally normally: `true`
Boundary abnormal: `true`
Decoder bug direct hypothesis: `weakened_by_locally_normal_string_termination`
Payload accounting mismatch hypothesis: `still_supported_by_boundary_crossing`
Causal conclusion: `not_determined`

## Task 115 Comparison

Exact Task 115 numbers matched: `true`
Differences: `0`

## Risk And Protection

Direct missing UPDATE skip status: `unsafe_diagnostic_only`
Parser fix recommended now: `false`
Source 2 semantics claimed: `false`
Replay 005 processed: `false`
Bots 006-008 processed: `false`
Candidates 011-020 touched: `false`
String values committed: `false`
String bytes committed: `false`
Raw payloads committed: `false`

Summary output: `output/local-replay-processing/replay_010-loop-26-string-reader-accounting/`

Task 117 was not created.
