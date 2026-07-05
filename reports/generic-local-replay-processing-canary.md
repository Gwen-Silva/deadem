# Generic Local Replay Processing Canary

Task: 102

Gate: `generic_local_replay_source_artifacts_ready_canonicalization_pending`

## Result

Task 102 created a bounded generic local-input canary for:

- input: `.local/deadem/replays/inbox/partida_010.dem`
- replay ID: `replay_010`
- command: `node tools/process-local-replay-input.mjs --input .local/deadem/replays/inbox/partida_010.dem --replay-id replay_010 --local-output .local/deadem/cache/local-replay-processing/replay_010/ --summary-output output/local-replay-processing/replay_010-canary/`

The canary validates that the local replay can be hashed and opened through the generic `deadem.Player.load(createReadStream(input))` API without moving it into `samples/` or writing to `output/replays/`.

## Source Artifact Status

Source artifact generation worked. The full parser source summary remains local-only at:

`.local/deadem/cache/local-replay-processing/replay_010/parser-source-summary.json`

Committed outputs contain only compact identity, storage, performance, validation, protection, and gate summaries. The raw replay was not copied or committed.

## Canonicalization Status

Canonical package construction for arbitrary local input remains pending. No canonical factual events, snapshots, entity registry, player registry, lane labels, regions, proximity, transforms, mechanics, fights, rotations, pressure, macro, roles, or decision analysis were emitted.

## Protection Summary

- Replay 005 was not read, hashed, copied, opened, inspected, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were not read, hashed, parsed, or processed.
- `samples/**` and `output/replays/**` were not used.
- `.local` artifacts were not committed.

## Validation Notes

Focused tests, task queue validation, JSON validation, and lint passed. The
output-size guard was run and continued to report the preexisting oversized
`output/04-controller-pawn-lifecycle.json`; Task 102 did not create or modify
that file.

## Outputs

- `output/local-replay-processing/replay_010-canary/pipeline-inventory.json`
- `output/local-replay-processing/replay_010-canary/input-identity.json`
- `output/local-replay-processing/replay_010-canary/source-artifact-manifest.json`
- `output/local-replay-processing/replay_010-canary/canonical-compact-manifest.json`
- `output/local-replay-processing/replay_010-canary/validation-summary.json`
- `output/local-replay-processing/replay_010-canary/performance-baseline.json`
- `output/local-replay-processing/replay_010-canary/storage-baseline.json`
- `output/local-replay-processing/replay_010-canary/protection-audit.json`
- `output/local-replay-processing/replay_010-canary/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-canary/local-processing-gate.json`

## Remaining Blocker

The generic local source-artifact path exists, but generic canonical package construction is not wired for arbitrary local replay input. No Task 103 was created.
