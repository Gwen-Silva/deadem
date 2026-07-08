# Death Validation Compact Emission

Gate: `death_validation_compact_artifacts_emitted`

Task 158 emitted exactly one schema-backed `death_validation` compact artifact for each authorized replay.

## Results

- replay_010: source_events_available_with_limitations; eventCount=45; duplicateKeyCount=0
- replay_011: source_events_available_with_limitations; eventCount=80; duplicateKeyCount=0
- schema validation: passed
- output policy: passed
- size audit: passed

## Limits

The artifacts are counter-transition summaries only. They do not include event rows, entity/player identifiers, field values, attribution, snapshots, final death facts, or gameplay interpretation.

## Next

death_validation compact emission is summary-only; richer source classes still need policy-specific schemas before emission.
