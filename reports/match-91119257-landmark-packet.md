# Match 91119257 Landmark Packet

## Scope

This report integrates the supplied local evidence packet for match 91119257. It does not validate lane transitions, rotations, fight grouping, combat intent, objective decisions, macro events, or replay 005.

## Confirmed

- Preserved 6 local packet files with matching SHA-256 checksums.
- Parsed 88 CSV events with required schema.
- Generated 147 landmark observations and 110 canonical landmark groups.
- Candidate demo samples/partida_006.dem opens as a file, but identity is not validated.

## Partially Confirmed

- None.

## Contradicted

- Demo duration 1863s vs scoreboard 30:22.
- Roster extraction failed: Unable to find an entity with index [ 5594 ]

## Unresolved

- Video file was not available locally, so manual windows were not verified against frames.
- No defensible video-to-demo transform was established because shared anchors were unavailable.
- Direct match ID and map name were not exposed by the parser path.
- World-to-minimap calibration remains unresolved for manual landmarks without stable demo entity or frame-coordinate correspondence.
- The E088 correction remains unverified against video frames.

## User Asserted Only

- Mid Boss stored at normalized minimap center (0.5, 0.5), vertical_level underground.
- Tunnels and stairs remain unmapped.

## Metrics

- CSV events: 88
- Events aligned to demo: 0
- Ambiguous/low-confidence windows: 1
- Corrected timestamp candidates: 1
- Canonical landmark groups: 110
- Demo-resolved landmarks: 0

## Gate

`match_91119257_identity_blocked`
