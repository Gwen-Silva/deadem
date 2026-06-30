# Replay 009 Objective/Structure Independent Validation

Task 064 validates Task 063 bounded factual events against the user-supplied replay-009 video.

## Result

- Gate: `replay_009_objective_structure_events_independently_validated_with_gaps`
- Video: `replay_009_independent_validation.mp4.mp4`
- Video identity: supported
- Independent source scope: independent visual rendering path, not independent match data origin
- Synchronization: usable with constraints, 4 anchors, linear mapping
- Median residual: 13.058s
- Maximum residual: 22.782s
- Sampled events: 37

## Category Results

| Category | Status | Confirmed | Supported | Not visible | Ambiguous/other |
| --- | ---: | ---: | ---: | ---: | ---: |
| mid_boss | validated_with_constraints | 2 | 2 | 0 | 0 |
| guardian | not_observable | 0 | 0 | 4 | 0 |
| walker | validated_with_constraints | 0 | 6 | 4 | 0 |
| barrack_boss | partially_supported | 0 | 0 | 0 | 7 |
| boss_tier3 | partially_supported | 0 | 0 | 0 | 1 |
| trooper_boss | partially_supported | 0 | 0 | 0 | 6 |
| spirit_urn_candidates | partially_supported | 0 | 0 | 0 | 5 |
| rejuvenator_candidate | not_tested | 0 | 0 | 0 | 0 |

## Interpretation

Mid Boss receives the strongest visual support: the arena and boss model are visible around both parser deletion windows. Walker and Patron/base categories have partial visual support, but several deletion timings are not visible or class-specific mapping remains ambiguous. Guardian sampled entities are not clearly visible. Spirit Urn candidate classes remain unresolved, and Rejuvenator is not validated.

No mechanic effects were applied. Health zero remains a raw observation only, and entity deletion is not interpreted as kill, destruction, secure, claim, deposit, or objective completion.
