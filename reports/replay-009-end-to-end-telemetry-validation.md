# Replay 009 End-To-End Telemetry Validation

## Result

- Gate: `replay_009_telemetry_usable_with_known_gaps`
- Replay: `samples/replay_009_normal.dem`
- Parser completion: true
- Structural completion: true
- Replay 005: excluded
- Bot fixtures 006-008: excluded

## Match Envelope

Parser duration is 2170.703s versus user-reported 2131s, delta 39.703s. Explicit pause intervals are not exposed by this validation path.

## Roster

Detected 12 player identities. Team distribution: {"2":6,"3":6}.

## Telemetry Quality

- Position mean coverage: 1
- Largest position gap: 0s
- Sudden displacement flags: 0
- Economy fields: netWorth
- Death counter events: 84

## Cross-Source Consistency

- player roster vs expected metadata: consistent (12 matches, 0 mismatches, 0 unknown)
- team distribution vs expected 6v6 shape: consistent (2 matches, 0 mismatches, 0 unknown)
- death events vs lifecycle deaths: consistent (84 matches, 0 mismatches, 0 unknown)
- position rows vs roster: consistent (26052 matches, 0 mismatches, 0 unknown)
- economy availability vs roster: consistent (12 matches, 0 mismatches, 0 unknown)
- pause metadata vs parser pause events: not_comparable (0 matches, 0 mismatches, 1 unknown)
- duration metadata vs parser envelope: consistent (1 matches, 0 mismatches, 0 unknown)

## Downstream Readiness

- player trajectory analysis: ready_with_constraints - positions are sampled at one second with discontinuity flags
- lane occupancy: not_ready - semantic occupancy branch remains frozen; replay 009 lacks structural lane projection validation in this task
- rotation detection: not_ready - rotation detection remains methodologically blocked
- fight participation: not_ready - killer/assist/source-target damage are incomplete for this replay validation
- death review: ready_with_constraints - death counter events are available, killer/assist attribution is incomplete
- economy progression: ready_with_constraints - net worth is available; spend/unsecured semantics are unknown
- objective participation: not_tested - objective lifecycle for replay 009 was not built in this task
- teamfight reconstruction: not_ready - fight grouping is not supported
- macro decision analysis: not_ready - strategic interpretation is explicitly out of scope

## Highest-Impact Gap

explicit_pause_interval_not_exposed

## Corpus Classification

- Compatible normal replay fixtures: 001, 002, 003, 004, 009.
- Unsupported solo-bot fixtures: 006, 007, 008.
- Protected holdout: 005.
