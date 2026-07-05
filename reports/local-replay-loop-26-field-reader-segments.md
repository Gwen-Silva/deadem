# Local Replay Loop 26 Field Reader Segments

Gate: `local_replay_loop_26_field_reader_segments_diagnosed`

## Passes

Default failure reproduced: `true`
Diagnostic failure reproduced without recovery: `true`
Recovery added or promoted: `false`

## Loop 26

Packet ordinal: `953`
Entity: `2598`
Class: `CCitadel_Ability_Familiar_HelpingHands`
Payload bits: `221`
Actual consumed after command: `501`
Extra bits: `280`
Extractor mutations: `7`
Field path bits: `53`
Field reader bits: `448`
Total extractor bits: `501`
Segment count: `7`
Largest segment bits: `288`
Segment sum: `448`
Single segment accounts for most of extra 280: `true`

## Loops 27-29

All zero before field reader: `true`
Status: `27:supported_by_extractor_metrics_only, 28:supported_by_extractor_metrics_only, 29:supported_by_extractor_metrics_only`

## Hypotheses

Loop 26 large field segment: `supported`
Following payload absorption: `possible_not_proven`
SerializedEntities direct skip status: `supported_for_this_canary`
Accounting artifact: `possible`
Causal conclusion: `not_determined`

## Task 112 Comparison

Exact Task 112 numbers matched: `true`
Differences: `0`

## Risk And Protection

Direct missing UPDATE skip status: `unsafe`
Parser fix recommended now: `false`
Source 2 semantics claimed: `false`
Replay 005 processed: `false`
Bots 006-008 processed: `false`
Candidates 011-020 touched: `false`
Field values committed: `false`
Raw payloads committed: `false`

Summary output: `output/local-replay-processing/replay_010-loop-26-field-reader-segments/`

Task 114 was not created.
