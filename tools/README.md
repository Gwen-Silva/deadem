# Tools Guide

`lib/canonical-state/` is the reusable canonical-state core.

Replay-specific tools are adapters, historical entrypoints, or validation
orchestrators. They should not be treated as proof that a historical gate was
accepted.

Replay-002 tooling notes:

- `tools/build-replay-002-canonical-state.mjs` is a replay-002 adapter and
  historical entrypoint.
- `tools/finalize-replay-002-canonical-v8.mjs` and
  `tools/verify-replay-002-canonical-v8-release-envelope.mjs` represent the
  Task 089 v8 implementation history.
- Task 089 v8 was rejected after technical review. These tools do not make v8
  accepted current state.
- Task 094 will create or update the replay-002 v9 execution path for the four
  frozen terminal validation blockers.
- Task 095 will introduce the generic multi-replay entrypoint only after real
  differences in replays 001, 003, and 004 are known.

Do not create speculative generic CLIs or rename internal source modules merely
for style during consolidation tasks.
