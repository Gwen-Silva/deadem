# Task 033: Process Match 91119257 Landmark Packet

Status: completed
Execution mode: autonomous
Project stage: External evidence packet integration
Related experiment: match 91119257 manual landmark calibration
Priority: high
Depends on: descriptive spatial and objective layers available; replay 005 remains protected
Unlocked by: user supplied local evidence packet for match 91119257
Blocks: future coordinate-calibration review

## Objective

Preserve and process the supplied match 91119257 manual landmark packet as evidence for replay-time, video-time, and minimap landmark calibration without claiming macro, transition, rotation, combat-intent, or strategic validation.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `reports/unified-descriptive-match-state-timeline.md`
- local packet files under `C:/Users/gwenm/Downloads/deadlock_match_91119257_packet/`
- candidate demo `samples/partida_006.dem` when available

## Work requested

- Preserve the input packet under a repository evidence/raw-data path.
- Record file checksums and external source retrieval metadata.
- Validate CSV schema, timestamp ordering, and the known final timestamp issue.
- Validate candidate demo identity where parser-exposed fields permit it.
- Produce aligned event rows with preserved original and resolved video intervals.
- Produce landmark observation evidence and canonical landmark tables using manual map coordinates when direct demo/video calibration is unavailable.
- Add Mid Boss only as user-asserted underground center evidence.
- Preserve tunnels and stairs as unmapped.
- Generate a validation report separating confirmed, partially confirmed, contradicted, unresolved, and user-asserted-only evidence.

## Constraints

- Do not process replay 005.
- Do not infer macro events, lane transitions, rotations, fight grouping, combat intent, objective decisions, or strategic judgments.
- Do not replace original manual timestamps; store corrections with provenance.
- Do not claim video/demo alignment when video or demo anchors are unavailable.
- Keep vertical level as first-class evidence.
- Keep individual outputs below 10 MiB.

## Inputs

Manual packet files, candidate demo `samples/partida_006.dem`, existing project decisions, and existing validated descriptive layers.

## Outputs

- `data/evidence/match_91119257/raw/`
- `output/match_91119257/input-file-manifest.json`
- `output/match_91119257/event-alignment.json`
- `output/match_91119257/landmark-observations.json`
- `output/match_91119257/canonical-landmarks.json`
- `output/match_91119257/tracked-player-telemetry.json`
- `output/match_91119257/validation-report.json`
- `reports/match-91119257-landmark-packet.md`

## Acceptance criteria

- Packet files are preserved with checksums.
- Every CSV row has an alignment status.
- Original and resolved timestamps are both retained.
- The final duplicated timestamp is corrected or explicitly unresolved with provenance.
- Demo identity is validated where possible and limitations are documented.
- Landmark coordinates preserve vertical level and confidence.
- Mid Boss is present only as user-asserted unless independently verified.
- Tunnels and stairs remain unmapped.
- Validation report separates confirmed, partially confirmed, contradicted, unresolved, and user-asserted-only evidence.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing.
- Output-size checks.
- CSV row-count and schema checks.
- Timestamp ordering checks.
- Checksum verification.
- Replay 005 protection.
- Task queue validation.
- Git verification that `.dem` files and prior outputs were not modified.

## Gate result

Allowed results:

- `match_91119257_packet_integrated_with_limitations`
- `match_91119257_identity_blocked`
- `match_91119257_sources_insufficient`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md` when justified.

## Git scope

Use explicit staging only. Commit this task separately.

## Expected report

Summarize copied inputs, checksums, demo/video availability, event coverage, timestamp correction, landmark table status, Mid Boss treatment, unmapped features, gate result, and remaining unresolved questions.

## Stop conditions

Stop after producing and committing the packet integration outputs. Do not promote macro, transition, combat, strategic, or replay 005 work.
