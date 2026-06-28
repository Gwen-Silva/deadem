# Match 91119257 Visual Demo Calibration

## Scope

This task uses the user override that `samples/partida_006.dem` corresponds to the supplied match packet and local video. The override is provenance for controlled calibration work, not parser-proven match identity. Replay 005 was not processed.

## Video Decoder

- Selected decoder: `windows_wpf_mediaplayer`
- Duration domains: scoreboard 1822s; video 1843s; demo container/player 1863s
- Frames decoded: 281/281
- Large frame files are local derived evidence under `output/match_91119257/local-frame-evidence/task035-frames` and should not be committed.

## Annotation Validation

- visual_confirmed: 0
- visual_partially_confirmed: 0
- visual_ambiguous: 88
- visual_contradicted: 0
- frame_unavailable: 0

Frame-level evidence now exists, but semantic visual confirmation was not automated in this run. Annotation statuses remain evidence classifications, not ground truth.

## E088

- Result: `both_ambiguous`
- Reason: Both candidate windows were decoded where possible, but this autonomous run did not perform semantic frame review sufficient to confirm which window matches the annotation.

## Parser Diagnostic

- Entity 5594 reproduced: true
- Current tick before failure: 3807
- Time before failure: 119s
- Root cause area: parser_library_entity_registry_update_path
- Recovery behavior: script_local_monkey_patch_packet_skip_for_known_entity_registry_errors
- Recovery warnings: 1001

The script-local recovery can skip affected packets, but warnings cascade, so telemetry after the early parser-safe window is low confidence and not suitable for alignment.

## Telemetry And Alignment

- Tracked-player rows: 151
- First/last telemetry second: 0/150
- Alignment transform: none
- Residual summary: {"count":0,"median":null,"p90":null,"max":null}
- Annotation/entity resolved count: 0

## Aliases

No side or lane color alias was visually validated. Neutral structural IDs remain authoritative; Archmother/Hidden King and Green/Blue/Yellow aliases remain unresolved.

## Gate

`visual_demo_calibration_parser_blocked`
