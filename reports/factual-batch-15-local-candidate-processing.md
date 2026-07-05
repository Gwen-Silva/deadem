# Factual Batch 15 Local Candidate Processing

## Frozen Acceptance Matrix

| Requirement | Status |
| --- | --- |
| Accepted five pilot replays remain included. | met |
| Local candidates processed in stable filename order. | met |
| Replay 005 untouched. | met |
| Bot fixtures 006-008 not processed. | met |
| No samples path used. | met |
| No copy fallback used. | met |
| No full package dumps committed. | met |
| No forbidden semantic layer emitted. | met |
| No replay-specific branch introduced. | met |
| Task 102 not created. | met |

Gate: `factual_batch_15_candidate_processing_blocked`

## Candidate Files Attempted

- `partida_010.dem` -> `replay_010`: failed
- `partida_011.dem` -> `replay_011`: failed
- `partida_012.dem` -> `replay_012`: failed
- `partida_013.dem` -> `replay_013`: failed
- `partida_014.dem` -> `replay_014`: failed
- `partida_015.dem` -> `replay_015`: failed
- `partida_016.dem` -> `replay_016`: failed
- `partida_017.dem` -> `replay_017`: failed
- `partida_018.dem` -> `replay_018`: failed
- `partida_019.dem` -> `replay_019`: failed
- `partida_020.dem` -> `replay_020`: failed

## Candidate Files Accepted

none

## Candidate Files Failed

- `partida_010.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_011.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_012.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_013.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_014.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_015.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_016.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_017.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_018.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_019.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.
- `partida_020.dem`: No scoped generic parser/canonicalization command is available that accepts arbitrary local input paths and local output roots without moving candidates into samples or modifying existing replay outputs.

Reserve candidates not processed: none

Total accepted batch count: 5
15 reached: false

## Raw Replay Access Summary

Raw replay files read for hash: 11
Raw replay hashes computed: 11
Replay parser processing performed: false

## Parser And Source Artifacts

Candidate canonicalization is blocked because no scoped generic parser and
canonicalization command is available for arbitrary local input paths without
moving files into forbidden locations or introducing a one-off workaround.

## Schema Compatibility

New candidates were not accepted, so no new candidate schema compatibility is
claimed. Existing five pilot entries remain referenced as accepted historical
inputs.

## Category Coverage

No new candidate categories were emitted.

## Provenance Status

Raw candidate provenance is limited to authorized filename, size, and SHA-256
for the candidate files attempted. No parser-derived factual provenance was
generated.

## Protection Audit

- Replay 005 touched: false
- Bot fixtures processed: false
- Samples used: false
- Copy fallback used: false
- .dem committed: false
- .local committed: false

## Storage Policy

Only compact summaries, hashes, gates, reports, and audit outputs are committed.
No full canonical package dumps or parser traces are committed.

## Accepted Limitations

- The batch is blocked until a generic local-input replay processing path exists.
- Task 102 was not created.
