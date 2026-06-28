# Descriptive Spatial Evidence Layer

This layer is non-semantic point evidence. It describes physical proximity to structurally derived lane axes and base/deployment exclusion only.

## Classes

- high_confidence_lane_proximity: The player coordinate is physically close to a structural lane axis with strong separation from alternatives. Rule: direct coordinate, not base/deployment, nearestDistance <= 380, separationMargin >= 90
- ambiguous_lane_proximity: The player coordinate is near a lane axis but geometric separation is not strong enough for high-confidence proximity. Rule: direct coordinate, not base/deployment, nearestDistance <= 520, separationMargin >= 45, but not high confidence
- base_or_deployment: Base/deployment geometry excludes high-confidence lane proximity. Rule: direct coordinate near team base, enemy base, or deployment evidence
- neutral_or_unclassified: No conservative lane-proximity evidence is available for this point. Rule: direct coordinate without enough lane-axis proximity or separation evidence
- missing_or_invalid: No spatial evidence is available. Rule: missing or invalid coordinate

## Allowed use

Coaches and analysts may use these classes to inspect where a player coordinate was physically near a neutral structural lane axis, where base/deployment geometry excludes lane-proximity evidence, and where the geometry is ambiguous or missing.

## Prohibited use

Do not read these classes as semantic lane occupancy, rotations, strategic assignments, pressure, farming, or correctness labels.
