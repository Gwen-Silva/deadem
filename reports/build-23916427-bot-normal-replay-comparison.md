# Build 23916427 Bot And Normal Replay Parser Comparison

## Objective

Task 054 expanded the parser compatibility corpus with the user-supplied build 23916427 replays 007, 008, and 009. Replay 005 was excluded and no parser recovery or fix was added.

## Replay Availability

- replay_007: expected `partida_007.dem`, actual `replay_007_bots01.dem`, available true.
- replay_008: expected `partida_008.dem`, actual `replay_008_bots02_short.dem`, available true.
- replay_009: expected `partida_009.dem`, actual `replay_009_normal.dem`, available true.

## Execution Summary

| Replay | Mode | Ending | Default parser | First failure | Structural pass |
| --- | --- | --- | --- | --- | --- |
| replay_007 | bots | normal | failed | unknown | complete |
| replay_008 | bots | player_quit | failed | unknown | complete |
| replay_009 | normal_human_match | normal | complete | none | complete |

## Replay 006 Signature Search

- replay_007: not_reached at tick 18, entity 269035851.
- replay_008: not_reached at tick 3480, entity 4436.
- replay_009: absent.

## Comparisons

- Replay 007 vs 009: unknown vs none.
- Replay 007 vs 008: unknown vs unknown.

## Decision

Best-supported model: `solo_bot_mode_lifecycle_defect_supported`.

A bot replay reproduced a parser failure while the normal replay succeeded.

Task 053 decision: `task_053_reframed_for_bot_mode`.

## Gate

`new_replay_corpus_comparison_ready`
