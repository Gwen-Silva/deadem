# Replay 009 Landmark Measurement

Task 072 measures user-supplied replay-009 map/minimap images that were missing during Task 071.

The images remain local-only under `.local/spatial-inputs/replay-009-user-maps/` and are not committed. This directory contains only compact hashes, dimensions, role classifications, visual pixel measurements, and a future fit/validation anchor plan.

Important limits:

- Measurements use top-left image pixel coordinates and normalized image coordinates.
- The standard replay minimap is direct visual evidence from replay 009.
- Modded maps and diagrams are human-supplied visual aids, not official map assets.
- No replay world-to-map transform, lane, region, proximity, mechanic effect, or macro interpretation is emitted.
