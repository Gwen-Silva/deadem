# Replay 009 Fixed Entity Spatial Property Diagnosis

Task 075 diagnosed whether replay 009 exposes fixed-entity spatial coordinates for `CNPC_MidBoss` and `CNPC_Boss_Tier2`.

## Result

Gate: `replay_009_fixed_entity_spatial_properties_ready_with_gaps`

Diagnosis: `coordinates_omitted_by_compact_filter`

The bounded parser pass inspected target serializers, CREATE/early UPDATE field paths, current target entity fields, component/reference-style fields, and player pawn controls. Player pawn controls confirm that replay 009 positions are decoded through `CBodyComponent.m_vecX/Y/Z`. Target Walker-class entities also expose `CBodyComponent.m_vecX/Y/Z` and `CBodyComponent.m_cellX/Y/Z` coordinate-like fields in bounded parser evidence, including CREATE payloads. These fields were absent from the prior compact objective/structure observability outputs, so the missing coordinates are best diagnosed as compact-filter omission rather than a decoder failure.

## Counts

- Target field-path observations: 1097
- Target position-candidate field observations: 724
- Serializer spatial/reference declarations found: 68
- Coordinate candidates recovered: 8
- Payload coordinate candidates recovered: 4
- Current-state coordinate candidates recovered: 4
- Component references resolved: 0

## Boundary

No transform was fitted. No Walker lane assignment, permutation search, player lane occupancy, regions, proximity, mechanic effect, or macro interpretation was produced. The recovered coordinate-like fields require a follow-up bounded coordinate and identity-resolution task before transform fitting can be retried.
