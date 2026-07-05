# Task 100: Normalize Local Human Replay Inbox And Generate Metadata

Status: completed

Gate: `human_replay_inbox_normalized`

## Objective

Move eligible local replay candidate filenames from `replays/inbox/` to the
ignored canonical inbox `.local/deadem/replays/inbox/` by rename only and create
metadata stubs when missing.

## Result

The accidental inbox existed and contained 11 eligible candidate filenames:

- `partida_010.dem`
- `partida_011.dem`
- `partida_012.dem`
- `partida_013.dem`
- `partida_014.dem`
- `partida_015.dem`
- `partida_016.dem`
- `partida_017.dem`
- `partida_018.dem`
- `partida_019.dem`
- `partida_020.dem`

All 11 were moved by filesystem rename to `.local/deadem/replays/inbox/`.
Eleven local metadata stubs were generated beside them. The local files and
metadata remain ignored and were not committed.

## Protections

- Replay file contents read: false
- Replay hashes computed: false
- Replay processing performed: false
- Copy fallback used: false
- Replay 005-like filenames moved: false
- Bot fixture 006-008-like filenames moved: false
- Task 101 created: false

## Outputs

- `output/replay-intake/human-replay-intake-readiness.json`
- `output/replay-intake/human-replay-normalization-summary.json`
- `reports/human-replay-inbox-normalization.md`
- `docs/HUMAN_REPLAY_INTAKE.md`
- `tools/normalize-human-replay-inbox.mjs`
- `tests/human-replay-inbox-normalization.test.mjs`
