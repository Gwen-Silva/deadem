# Replay 010 Entity Index Allocation Gap Diagnosis

Gate: `local_replay_entity_index_allocation_gap_diagnosed`

## Result

- Entity 2905 CREATE observed: `false`
- Entity 2905 register attempted: `false`
- Entity 2905 class lookup attempted: `false`
- Entity 2905 baseline lookup attempted: `false`
- First missing UPDATE: packet `954`, loop `33`
- Classification: `never_registered_entity_with_create_gap`

## Range 2880-2920

- Created indexes: `2897, 2898, 2899, 2900, 2901, 2902`
- Registered indexes: `2897, 2898, 2899, 2900, 2901, 2902`
- Gap group containing 2905: `{"start":2903,"end":2920,"count":18}`
- Max created before failure: `2902`

## Packet 954

- Indexes monotonic in local window: `true`
- Jump to 2905: `187` from `2717`
- Read counts within entityData: `true`
- Index stream assessment: `not_determined_large_jump_but_bounds_clean`

## Default Versus Truncation

- Range summary changed: `false`
- Entity 2905 provenance changed: `false`
- Packet 954 sequence changed: `false`

## Conclusion

- Create-gap conclusion: `entity 2905 is observed as a missing UPDATE inside an allocation gap without prior local CREATE/register/class/baseline evidence`
- Safest next step: `compare_packet_954_index_stream_with_independent_decoder_or_static_source2_contract`

## Limits

- Diagnostics are opt-in and do not change default parser behavior.
- No recovery, placeholder entity, fake field, canonical package, source artifact, or match fact was produced.
- No Source 2 semantic conclusion, parser bug conclusion, replay corruption conclusion, or final parser fix is made.
