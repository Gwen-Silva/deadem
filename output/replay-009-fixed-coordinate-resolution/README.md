# Replay 009 Fixed Coordinate Resolution

Task 076 creates a bounded replay-side coordinate layer for `CNPC_MidBoss` and `CNPC_Boss_Tier2`.

Gate: `replay_009_fixed_entity_coordinates_ready_with_gaps`

Accepted coordinate basis: `vector_only`

Resolved coordinate observations: 4

This output uses parser-exposed `CBodyComponent.m_vecX/Y/Z` as the supported project replay-coordinate basis. Cell fields are preserved separately as metadata/raw evidence. No transform, lane, region, proximity, canonical rewrite, mechanic effect, or macro interpretation was produced.
