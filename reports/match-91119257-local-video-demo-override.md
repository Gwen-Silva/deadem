# Match 91119257 Local Video Demo Override

## Scope

This task continues match 91119257 using the user's explicit override that `samples/partida_006.dem` is the target bot match. It does not validate macro events, transitions, rotations, fight grouping, combat intent, objective decisions, strategic judgments, or replay 005.

## Confirmed

- Local video exists and reports duration 30:43.
- User override accepts samples/partida_006.dem as the target bot replay.
- Demo opens through Player with duration 1863s.
- Tracked-player telemetry extracted: 119 one-second rows (partial_extraction_parser_stopped).

## Partially Confirmed

- Roster probe finds the user-named player in the demo, but parser match ID and map are still unavailable.

## Unresolved

- No frame-level inspection was performed because ffmpeg/ffprobe are unavailable in PATH.
- No anchor-based video-to-demo transform was selected.
- Manual landmark world/minimap calibration remains unresolved.
- E088 remains a likely timestamp correction, not video-confirmed.

## User Asserted Only

- Demo identity relies on the current user override.
- Mid Boss center/underground assertion remains inherited from task 033.

## Gate

`match_91119257_override_ready_with_limitations`
