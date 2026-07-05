# Local Replay Pre-Recovery Mismatch Field Consumption

Gate: `local_replay_pre_recovery_mismatch_field_consumption_diagnosed`

## Default And Diagnostic Passes

Default failure reproduced: `true`
Diagnostic failure reproduced without recovery: `true`
Recovery added or promoted: `false`

## Target Packet

Packet ordinal: `953`
Updated entries: `30`
Payload size count: `30`
Payload bits sum: `5010`
Payload iterator aligned: `true`

## Mismatch Loops

Same Task 111 mismatches confirmed: `true`
Loop 26 extra consumption bits: `280`
Loop 26 has extra 280 bits: `true`
Loops 27-29 zero consumption observed: `true`
Read counts monotonic: `true`
Evidence classification: `field_level_consumption_mismatch_with_following_zero_mutation_updates`
Causal conclusion: `not_determined`

## Extractor Metrics

Context entries with diagnostics: `10`
Zero-consumption loops: `27, 28, 29`
Mismatch loops: `26, 27, 28, 29`
Extractor threw: `false`

## Risk

Direct missing UPDATE skip status: `unsafe`
Parser fix recommended now: `false`
Source 2 semantics claimed: `false`

## Protection

Replay 005 processed: `false`
Bots 006-008 processed: `false`
Candidates 011-020 touched: `false`
Automatic recovery added: `false`
Canonical package constructed: `false`
Factual artifacts emitted: `false`

Summary output: `output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/`

Task 113 was not created.
