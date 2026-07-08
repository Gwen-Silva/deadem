# Allowlisted Death Validation Batch Parity

Gate: `allowlisted_death_validation_batch_parity_emitted`

Task 171 emitted compact `death_validation` artifacts through a manifest-driven allowlisted runner and compared them against Task 168.

## Results

- replay_001: source_events_available_with_limitations; eventCount=109; duplicateKeyCount=0
- replay_002: source_events_available_with_limitations; eventCount=53; duplicateKeyCount=0
- replay_003: source_events_available_with_limitations; eventCount=117; duplicateKeyCount=0
- replay_004: source_events_available_with_limitations; eventCount=58; duplicateKeyCount=0
- replay_009: source_events_available_with_limitations; eventCount=84; duplicateKeyCount=0
- replay_010: source_events_available_with_limitations; eventCount=45; duplicateKeyCount=0
- replay_011: source_events_available_with_limitations; eventCount=80; duplicateKeyCount=0
- replay_012: source_events_available_with_limitations; eventCount=81; duplicateKeyCount=0
- replay_013: source_events_available_with_limitations; eventCount=68; duplicateKeyCount=0
- replay_014: source_events_available_with_limitations; eventCount=77; duplicateKeyCount=0
- replay_015: source_events_available_with_limitations; eventCount=102; duplicateKeyCount=0
- replay_016: source_events_available_with_limitations; eventCount=73; duplicateKeyCount=0
- replay_017: source_events_available_with_limitations; eventCount=89; duplicateKeyCount=0
- replay_018: source_events_available_with_limitations; eventCount=103; duplicateKeyCount=0
- replay_019: source_events_available_with_limitations; eventCount=60; duplicateKeyCount=0
- schema validation: passed
- output policy: passed
- size audit: passed
- parity: passed

## Limits

`eventCount` remains a compact count of source-observed counter transition candidates, not final death facts.
No event rows, field values, identities, attribution, timelines, snapshots, final facts, source/canonical/match facts, or gameplay interpretation were emitted.
