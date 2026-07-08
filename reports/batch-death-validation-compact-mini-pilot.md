# Batch Death Validation Compact Mini-Pilot

Gate: `batch_death_validation_compact_mini_pilot_emitted`

Task 162 emitted compact schema-backed `death_validation` artifacts for replay_010 and replay_011 only.

## Results

- replay_010: source_events_available_with_limitations; eventCount=45; duplicateKeyCount=0
- replay_011: source_events_available_with_limitations; eventCount=80; duplicateKeyCount=0
- schema validation: passed
- output policy: passed
- size audit: passed

## Limits

`eventCount` remains a compact count of source-observed counter transition candidates, not final death facts.
No event rows, field values, identities, attribution, snapshots, final facts, or gameplay interpretation were emitted.
