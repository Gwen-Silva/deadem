# Task 034: Continue Match 91119257 With Local Video And Demo Override

Status: completed
Execution mode: autonomous
Project stage: External evidence packet integration
Related experiment: match 91119257 manual landmark calibration
Priority: high
Depends on: task 033 completed with gate `match_91119257_identity_blocked`
Unlocked by: user explicitly confirmed `samples/partida_006.dem` is the target bot match and supplied local video under `samples/videos/`
Blocks: future coordinate-calibration review

## Objective

Continue the match 91119257 packet processing using `samples/partida_006.dem` as the user-authorized target replay despite unavailable or conflicting parser identity fields, and use the local video file for additional validation where feasible.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- completed task 033
- `output/match_91119257/validation-report.json`
- `output/match_91119257/event-alignment.json`
- `output/match_91119257/landmark-observations.json`
- `samples/partida_006.dem`
- local video files under `samples/videos/`

## Work requested

- Record user override provenance for using `partida_006.dem`.
- Validate local video file metadata and extract a compact frame/contact-sheet sample when tools permit.
- Reprocess candidate demo with a safer sequential strategy suitable for the shorter bot replay.
- Extract roster and tracked-player telemetry when possible.
- Re-evaluate video/demo duration relationship using local video duration and demo duration.
- Preserve original and resolved event timestamps, including E088.
- Update validation status without claiming semantic occupancy, rotations, fights, macro events, or strategic judgment.

## Constraints

- Do not process replay 005.
- Do not commit `.dem` or video files.
- Do not infer macro events, lane transitions, rotations, fight grouping, combat intent, objective decisions, or strategic judgments.
- Do not claim ID equality when parser does not expose the match ID.
- Keep outputs below 10 MiB.

## Inputs

Task 033 outputs, `samples/partida_006.dem`, and `samples/videos/Partida_006_Replay.mp4`.

## Outputs

- `output/match_91119257/local-media-manifest.json`
- `output/match_91119257/demo-override-validation.json`
- `output/match_91119257/video-frame-samples.json`
- `output/match_91119257/updated-event-alignment.json`
- `output/match_91119257/updated-tracked-player-telemetry.json`
- `output/match_91119257/updated-validation-report.json`
- `reports/match-91119257-local-video-demo-override.md`

## Acceptance criteria

- Local video and demo are recorded with checksums and metadata.
- The user override is represented as provenance, not parser proof.
- Video/demo duration comparison is documented.
- Roster and telemetry are extracted if parser state permits it.
- Every event retains original and resolved timestamps.
- E088 remains provenance-preserving.
- Replay 005 protection is explicitly validated.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing.
- Output-size checks.
- Deterministic repeatability where outputs are generated from stable local files.
- Media metadata command result recorded.
- Replay 005 protection.
- Task queue validation.
- Git verification that `.dem`, video files, and prior outputs were not modified.

## Gate result

Allowed results:

- `match_91119257_override_ready_with_limitations`
- `match_91119257_media_validated_alignment_unresolved`
- `match_91119257_local_sources_insufficient`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md` when justified.

## Git scope

Use explicit staging only. Commit this task separately.

## Expected report

Summarize local media, override provenance, video/demo duration comparison, roster/telemetry result, event alignment status, E088 treatment, limitations, gate result, and replay 005 protection.

## Stop conditions

Stop after producing and committing the local video/demo override outputs. Do not promote macro, transition, fight, strategic, or replay 005 work.
