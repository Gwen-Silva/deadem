# Task 101: Process Local Human Replay Candidates For 15-Replay Batch

Status: completed

Gate: `factual_batch_15_candidate_processing_blocked`

## Objective

Process local human replay candidates from the normalized ignored inbox and
attempt to create a 15-human-replay factual batch.

## Result

The task blocked. Eleven authorized local candidates were available and were
read only to compute SHA-256 hashes:

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

Zero candidates were accepted because no scoped generic parser/canonicalization
command is available that accepts arbitrary local input paths and local output
roots without moving candidates into forbidden locations or introducing a
replay-specific workaround.

## Protection Summary

- Replay 005 read/hashed/opened/copied/processed: false
- Bot fixtures 006-008 processed: false
- Samples used for candidate files: false
- Copy fallback used: false
- `.dem` files committed: false
- `.local` files committed: false
- Unsupported semantic layers emitted: false
- Task 102 created: false

## Outputs

- `output/factual-batches/batch-015-human-factual-v2/manifest.json`
- `output/factual-batches/batch-015-human-factual-v2/candidate-processing-summary.json`
- `output/factual-batches/batch-015-human-factual-v2/candidate-failure-report.json`
- `output/factual-batches/batch-015-human-factual-v2/batch-gate.json`
- `reports/factual-batch-15-local-candidate-processing.md`
- `tools/process-local-human-candidates-for-15-batch.mjs`
- `tests/process-local-human-candidates-for-15-batch.test.mjs`
