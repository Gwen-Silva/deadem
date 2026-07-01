# Replay 009 Transform Validation Retry

Task 073 evaluated whether Task 072's measured minimap landmarks were sufficient to fit and validate a replay-009 world-to-map transform.

## Result

Gate: `replay_009_candidate_transform_not_ready`

Decision: `insufficient_grounded_correspondences`

No transform was fitted. The retry found zero grounded replay/map correspondences because fixed objective and structure entities in the canonical replay-009 layer do not currently carry world coordinates, and the six replay Walker entities remain unordered relative to the six measured map Walker landmarks. The task explicitly prohibited resolving those pairings by permutation search, residual minimization, nearest projected point, or symmetry assumptions.

## Evidence

- Task 072 provides measured minimap pixels for Mid Boss, Walkers, Guardians, and base symbols.
- Task 072 pre-registered five map-side fit anchors and two map-side validation anchors.
- Task 063/065 canonical entity events expose Mid Boss and Walker lifecycle/health/validation evidence, but their `spatial.worldPosition` fields are unavailable.
- No held-out validation anchor can be used until a replay-side entity/world coordinate is independently paired with its map-side landmark.

## Prohibited Outputs

No production transform, lane labels, regions, proximity, mechanic effects, player trajectory projections, or macro interpretations were emitted.

## Follow-Up

The next blocked step should resolve replay-side Walker identities and fixed entity world coordinates before any transform is retried.
