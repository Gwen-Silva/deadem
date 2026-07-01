# Replay 009 Fixed Spatial Property Diagnosis

Task 075 performs a bounded parser/extraction diagnosis for `CNPC_MidBoss` and `CNPC_Boss_Tier2`.

Gate: `replay_009_fixed_entity_spatial_properties_ready_with_gaps`

Diagnosis: `coordinates_omitted_by_compact_filter`

The parser exposes player pawn positions in replay 009 and target Walker-class entities expose bounded `CBodyComponent.m_vecX/Y/Z` and `m_cellX/Y/Z` coordinate-like fields. These fields were omitted by prior compact objective/structure observability filters. No transform, lane, region, proximity, mechanic effect, or macro output was produced.
