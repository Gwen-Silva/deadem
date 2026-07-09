# Allowlisted Death Validation Expanded 16 Batch Pilot

Gate: `allowlisted_death_validation_expanded_16_batch_pilot_ready`.

Task 174 enabled `replay_020` only through an explicit allowlisted batch manifest and ran `runnerMode: batch` without `--reference-status` or parity mode. The runner gate was `allowlisted_death_validation_batch_emitted`, with `parityStatus: not_required`.

## Scope

Processed replays: `replay_001`, `replay_002`, `replay_003`, `replay_004`, `replay_009`, `replay_010`, `replay_011`, `replay_012`, `replay_013`, `replay_014`, `replay_015`, `replay_016`, `replay_017`, `replay_018`, `replay_019`, `replay_020`.

Protected replay 005 and bot fixtures 006-008 remained globally blocked. `replay_020` used the explicit manifest path `.local/deadem/replays/inbox/partida_020.dem` and was not globally allowed outside that manifest.

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
- replay_020: source_events_available_with_limitations; eventCount=83; duplicateKeyCount=0

Schema validation: passed.
Output policy: passed.
Size audit: passed.
Overlap stability against Task 173 exact-15: passed.

## Limits

`eventCount` remains a source-observed counter transition candidate count, not a final death fact. No artifact outside `death_validation`, death events, respawn events, timelines, objective lifecycle, identity rows, attribution, field values, raw data, snapshots, full histories, source/canonical/match final facts, or gameplay interpretation was emitted.
