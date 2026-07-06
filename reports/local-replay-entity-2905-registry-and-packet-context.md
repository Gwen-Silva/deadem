# Replay 010 Entity 2905 Registry And Packet Context Diagnosis

Gate: `local_replay_entity_2905_registry_and_packet_context_diagnosed`

## Result

- Entity 2905 ever created before failure: `false`
- Entity 2905 ever registered before failure: `false`
- Entity 2905 removed before failure: `false`
- First missing update packet/loop: `954/33`
- First reference already missing update: `true`
- Missing packet read counts within entityData: `true`
- Truncation changes entity 2905 registry history: `false`
- Failure classification: `first_missing_update_to_never_registered_entity`
- Safest next step: `investigate_entity_create_delete_lifecycle_for_entity_2905_and_nearby_indexes`

## Nearby Indexes

- Nearby indexes summarized: `11`
- Nearby indexes created or registered normally: `2900, 2901, 2902`

## Task 120 Comparison

- Confirms default and truncation both reach missing entity 2905: `true`

## Limits

- Diagnostics are opt-in and do not change default parser behavior.
- No missing-entity recovery, placeholder entity, fake field, canonical package, source artifact, or match fact was produced.
- No Source 2 semantic conclusion, parser bug conclusion, replay corruption conclusion, or final parser fix is made.
