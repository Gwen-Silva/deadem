# Task 102: Create Generic Local Replay Processing Canary

Status: completed

Gate: `generic_local_replay_source_artifacts_ready_canonicalization_pending`

## Objective

Create or validate a safe generic local-input replay processing canary for `.local/deadem/replays/inbox/partida_010.dem` mapped to `replay_010`.

## Implementation

- Added `tools/process-local-replay-input.mjs`.
- Added focused tests in `tests/local-replay-processing-canary.test.mjs`.
- Generated compact committed summaries under `output/local-replay-processing/replay_010-canary/`.
- Kept parser source artifacts under `.local/deadem/cache/local-replay-processing/replay_010/`.

## Result

The canary successfully used the generic `deadem.Player.load(createReadStream(input))` API against the authorized local input path without moving the replay to `samples/` and without writing to `output/replays/`.

Canonical package construction for arbitrary local input remains pending, so the full readiness gate was not claimed.

## Protections

- Replay 005 was not read, hashed, copied, opened, inspected, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were not read, hashed, parsed, or processed.
- No raw replay file was committed.
- No local `.local` artifact was committed.
- No Task 103 was created.

## Validation

- Focused synthetic canary tests passed.
- The authorized replay_010 canary command completed with the partial source-artifact gate.
- Task queue, lint, JSON, and workflow review validations were run for the final commit.
- The output-size guard was run and continued to report the preexisting oversized `output/04-controller-pawn-lifecycle.json`; Task 102 did not create or modify that file.
