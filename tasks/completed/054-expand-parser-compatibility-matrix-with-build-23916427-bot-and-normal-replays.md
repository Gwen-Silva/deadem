# Task 054: Expand Parser Compatibility Matrix With Build-23916427 Bot And Normal Replays

Status: completed
Execution mode: autonomous
Project stage: parser compatibility
Depends on: task 052 completed
Blocked tasks not to execute: task 053

## Objective

Expand the parser compatibility corpus with user-supplied build 23916427 replays 007, 008, and 009, comparing bot/solo, quit/normal ending, and normal human match behavior against replay 006 and existing controls.

## Constraints

- Do not process replay 005.
- Do not execute task 053.
- Do not implement parser fixes.
- Do not add missing-entity, missing-baseline, or missing-class recovery.
- Do not rename, copy, or commit replay files.
- Keep full traces local/untracked.

## Required outputs

- `output/parser-compatibility/new-replay-metadata.json`
- `output/parser-compatibility/build-23916427-execution-matrix.json`
- `output/parser-compatibility/build-23916427-execution-matrix.csv`
- `output/parser-compatibility/new-replay-failure-signatures.json`
- `output/parser-compatibility/new-replay-structural-results.json`
- `output/parser-compatibility/new-replay-lifecycle-summary.json`
- `output/parser-compatibility/replay-006-signature-search.json`
- `output/parser-compatibility/bot-vs-normal-comparison.json`
- `output/parser-compatibility/new-corpus-decision.json`
- `output/parser-compatibility/new-corpus-validation.json`
- `output/parser-compatibility/new-corpus-gate.json`
- `reports/build-23916427-bot-normal-replay-comparison.md`

## Gate

Produce exactly one:

- `new_replay_corpus_comparison_ready`
- `new_replay_corpus_comparison_ready_with_missing_files`
- `new_replay_corpus_comparison_blocked`

Gate result: `new_replay_corpus_comparison_ready`

## Completion notes

- Actual local files were `samples/replay_007_bots01.dem`, `samples/replay_008_bots02_short.dem`, and `samples/replay_009_normal.dem`.
- Replay 005 was excluded.
- Replays 007 and 008 failed under default gameplay-state parsing in `svc_PacketEntities` missing-entity paths.
- Replay 009 completed under default gameplay-state parsing.
- All three new replays structurally traversed to EOF.
- No parser fix or recovery was added.

## Validation

- Engine tests.
- Structural-pass tests.
- Video-pipeline tests.
- ESLint.
- JSON/CSV validation.
- Deterministic rerun for at least replay 007 and replay 009.
- Replay 005 exclusion verification.
- Task queue validation.
- Documentation-link validation.
- Git status validation.
