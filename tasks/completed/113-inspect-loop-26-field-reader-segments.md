# Task 113: Inspect Loop 26 Field-Reader Segment Accounting Without Field Values

Status: completed

Gate: `local_replay_loop_26_field_reader_segments_diagnosed`

## Objective

Diagnose which internal extractor field-reader segments account for the extra
280 bits consumed in replay_010 packet ordinal 953 loop 26, without parser
recovery, field values, canonical artifacts, or match facts.

## Outputs

- `tools/inspect-replay-010-loop-26-field-reader-segments.mjs`
- `tests/loop-26-field-reader-segments.test.mjs`
- `output/local-replay-processing/replay_010-loop-26-field-reader-segments/`
- `reports/local-replay-loop-26-field-reader-segments.md`

## Result

The default pass reproduced the Task 105 failure at missing entity 2905. The
diagnostic pass used opt-in field-consumption instrumentation, no recovery, and
failed closed at the same first missing entity.

Loop 26 remained entity 2598, class
`CCitadel_Ability_Familiar_HelpingHands`, with `payloadBits` 221 and 501 actual
bits consumed after command. The extractor recorded 7 field-reader segments:
field-path accounting consumed 53 bits, reader segments summed to 448 bits, and
total extractor consumption was 501 bits. The largest segment consumed 288 bits,
which accounts for most of the extra 280 bits but does not exactly equal it.

Loops 27-29 produced zero field paths, zero field-reader segments, and zero
extractor bits at the current cursor despite positive payloadBits. This is
metric-only evidence, not a Source 2 semantic claim.

## Restrictions Preserved

- No replay 005 access.
- No bot replay processing.
- No candidates 011-020 processing.
- No `samples/**` or `output/replays/**` use.
- No field values, raw payloads, raw entityData, or raw serializedEntities
  committed.
- No parser recovery, placeholder entity, fake field, canonical package,
  factual artifact, spatial output, mechanic output, fight, macro, decision, or
  ML output.
- No Task 114 was created.

## Validation

Required focused tests, task queue validation, lint, output-size check,
Codex validation, and Codex review were run for the task. The known preexisting
oversize warning for `output/04-controller-pawn-lifecycle.json` remains outside
the Task 113 changes.
