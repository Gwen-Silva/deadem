# Replay 009 Human Annotation Packet

Task: `071-acquire-replay-009-independent-landmark-coordinates`

Human annotation gate: `replay_009_human_annotation_packet_ingested_with_missing_images`

## Summary

Task 071 ingested the user-provided replay-009 participant annotation packet as an advisory evidence layer.

The source is recorded as:

- source ID: `user_replay_009_participant_2026_07_01`
- source type: `human_player_annotation`
- participant: Aresius
- hero: Warden
- authority: advisory
- independent from parser: yes
- independent from match-data origin: no

The packet does not overwrite canonical facts, does not convert human game times into parser seconds, does not validate exact coordinates, and does not validate mechanic versions.

## Ingested Content

- 17 human event annotations.
- 13 human mechanics statements.
- map orientation and lane-order statements.
- stable landmark descriptions for Mid Boss, Walkers, lane Guardians, Patron/base structures, Shrines, and base Guardians.
- internal class uncertainty notes.

The pause at human-reported game time `00:06` was ingested as a participant report for early lane swapping. It does not establish the full pause duration and does not explain the full parser/reported duration delta.

## Image Status

The five referenced map/minimap images were not locally accessible to Codex. The task searched the repository, common input folders, `.local/`, `output-local/`, and the Codex attachment directory. No matching user map images were found.

Required local placement:

```text
.local/spatial-inputs/replay-009-user-maps/replay-009-custom-map-dense.jpg
.local/spatial-inputs/replay-009-user-maps/replay-009-custom-map-reduced.jpg
.local/spatial-inputs/replay-009-user-maps/replay-009-custom-map-clean.jpg
.local/spatial-inputs/replay-009-user-maps/replay-009-standard-minimap.jpg
.local/spatial-inputs/replay-009-user-maps/replay-009-urn-spawn-diagram.png
```

## Boundaries

No transform, lane, region, proximity, mechanic-effect, objective-completion, fight, pressure, rotation, or macro output was produced.

Replay 005 and bot fixtures 006-008 were not read or processed.
