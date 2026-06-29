# Task 035: Recover Match 91119257 Video Frame And Demo Telemetry Alignment

Status: completed
Execution mode: autonomous
Project stage: External visual/demo calibration
Related experiment: match 91119257 manual landmark calibration
Priority: high
Depends on: task 034 completed with gate `match_91119257_override_ready_with_limitations`
Unlocked by: user override that `samples/partida_006.dem` is the demo for the supplied visual-calibration packet and local video
Blocks: visually validated structural aliases and calibration follow-up

## Objective

Complete controlled visual-to-demo calibration for match 91119257 by obtaining frame-level evidence from the local MP4 and extending tracked-player plus structural telemetry beyond the current parser failure where safely possible.

The demo identity must be treated as user-overridden provenance, not parser-proven match identity.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `tasks/completed/033-process-match-91119257-landmark-packet.md`
- `tasks/completed/034-continue-match-91119257-with-local-video-and-demo-override.md`
- `reports/match-91119257-landmark-packet.md`
- `reports/match-91119257-local-video-demo-override.md`
- `output/match_91119257/input-file-manifest.json`
- `output/match_91119257/event-alignment.json`
- `output/match_91119257/landmark-observations.json`
- `output/match_91119257/canonical-landmarks.json`
- `output/match_91119257/validation-report.json`
- `output/match_91119257/local-media-manifest.json`
- `output/match_91119257/demo-override-validation.json`
- `output/match_91119257/updated-event-alignment.json`
- `output/match_91119257/updated-tracked-player-telemetry.json`
- `output/replay-lane-axis-topology-profile.json`
- `output/replay-geometry-profiles.json`
- `samples/partida_006.dem`
- `samples/videos/Partida_006_Replay.mp4`
- parser/player scripts directly imported by the new calibration script

## Work requested

- Locate deterministic local video decoding tooling before declaring video blocked.
- Create a deterministic frame index for all 88 annotations, E088 candidate windows, synchronization, clock, minimap, and structure-state frames.
- Validate annotation visibility from decoded frames where possible.
- Resolve E088 as original, corrected, ambiguous, neither, or unavailable.
- Diagnose parser entity index `5594` failure with tick/time/context/stack where available.
- Implement narrow fault-tolerant telemetry extraction without changing parser/package source.
- Extract tracked-player telemetry for Gwenzinha as far through the demo as safe.
- Extract structural/objective telemetry relevant to the 88 annotations.
- Estimate a simple video-to-demo time alignment using independent anchors when sufficient evidence exists.
- Match annotations to structural entities only when evidence is sufficient.
- Validate side and lane aliases only with provenance-preserving visual evidence.

## Constraints

- Do not process replay 005.
- Do not commit `.dem`, MP4, packet originals, or large extracted frame collections.
- Do not infer macro events, rotations, fights, semantic occupancy episodes, objective decisions, or strategic intent.
- Do not treat duration differences alone as proof of mismatch.
- Keep scoreboard duration, video duration, and demo duration as separate domains.
- Do not modify frozen occupancy models or parser package source.

## Inputs

Task 033 and task 034 outputs, `samples/partida_006.dem`, and `samples/videos/Partida_006_Replay.mp4`.

## Outputs

- `output/match_91119257/video-decoder-audit.json`
- `output/match_91119257/video-frame-index.json`
- `output/match_91119257/visual-annotation-validation.json`
- `output/archive/match_91119257/e088/e088-resolution.json`
- `output/match_91119257/parser-entity-5594-diagnostic.json`
- `output/match_91119257/parser-recovery-log.json`
- `output/match_91119257/full-tracked-player-telemetry.jsonl`
- `output/match_91119257/structural-entity-telemetry.json`
- `output/match_91119257/video-demo-time-alignment.json`
- `output/match_91119257/annotation-entity-matches.json`
- `output/match_91119257/canonical-map-aliases.json`
- `output/match_91119257/visual-demo-calibration-gate.json`
- `reports/match-91119257-visual-demo-calibration.md`

## Acceptance criteria

- Video decoder search and selected decoder/version are recorded.
- Frame index reconciles exactly 88 source annotations and includes E088 candidate windows.
- Frame paths point only to local derived evidence, not committed source media.
- Parser failure diagnostic records tick/time/context and recovery limitations.
- Telemetry extraction either reaches relevant annotations or documents the exact parser blocker.
- Structural telemetry is extracted without visual alias overreach.
- Time alignment keeps scale and offset explicit and reports residuals when anchors exist.
- Aliases are stored with provenance and unresolved status when not visually validated.
- Gate result is one of the allowed values.

## Required validation

- ESLint on new JavaScript.
- JSON and JSONL parse checks.
- Output-size checks.
- Deterministic frame-index checks.
- Annotation-count reconciliation: exactly 88 source events.
- Telemetry chronological checks.
- Parser-recovery diagnostic check.
- Video/demo alignment residual checks when anchors exist.
- Annotation-to-entity uniqueness checks.
- Alias provenance checks.
- Replay 005 protection.
- Task queue validation.
- Git verification that original MP4, `.dem`, and packet files were not modified or committed.

## Gate result

Allowed results:

- `visual_demo_calibration_ready`
- `visual_demo_calibration_ready_with_limitations`
- `visual_demo_calibration_parser_blocked`
- `visual_demo_calibration_video_blocked`
- `visual_demo_calibration_inconsistent`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md` when justified.

## Git scope

Use explicit staging only. Commit this task separately.

## Expected report

Summarize decoder tooling, frames extracted/indexed, annotation validation counts, E088 result, parser entity 5594 diagnosis, recovery behavior, telemetry coverage, alignment transform/residuals, annotation/entity matches, alias status, unresolved landmarks, gate result, and replay 005 protection.

## Stop conditions

Stop after producing and committing calibration outputs. Do not promote macro, transition, fight, strategic, or replay 005 work.
