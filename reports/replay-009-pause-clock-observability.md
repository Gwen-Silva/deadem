# Replay 009 Pause Clock Observability

## Result

- Gate: `replay_009_pause_clock_not_exposed`
- Direct pause signal found: false
- Game-clock source: none
- Active-game-time mapping: unavailable_no_reliable_clock_source
- Replay 005: excluded
- Bot fixtures 006-008: excluded

## Duration Reconciliation

- Parser duration: 2170.703s
- Reported duration: 2131s
- Difference: 39.703s
- Pregame: null
- Pause: null
- Postgame: null
- Unclassified: 39.703s

The 39.703s difference is not assigned to pause because no direct pause event or reliable game-clock freeze source was found.

## Clock Inventory

- Candidates: 8
- Changing candidates: 8
- Direct pause candidates: 0

## Impact

- player trajectory analysis: ready_with_constraints - parser-time trajectory remains usable; pause-aware active time unavailable
- death review: ready_with_constraints - death ordering remains usable; active-game-time normalization unavailable
- economy progression: ready_with_constraints - parser-time economy series remains usable; pause-normalized rates unavailable
- lane occupancy: not_ready - semantic occupancy remains frozen and clock observability does not change that
- rotation detection: not_ready - rotation detection remains blocked
- fight participation: not_ready - combat attribution/source-target damage remains incomplete
- objective timing: not_tested - objective layer for replay 009 was not built in this task
- teamfight reconstruction: not_ready - fight grouping remains unsupported
- macro decision analysis: not_ready - strategic interpretation remains out of scope
