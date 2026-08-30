# Minimum Factual Review Telemetry Contract

Task 199 consumes only the two replay paths and SHA-256 identities published by the accepted Task 198 manifest. It never searches for replay inputs and rejects historical replay aliases 005-008 before filesystem access.

The normalized time axis is replay elapsed time derived from source ticks and parser tick rate. It is not the displayed game clock. Detailed timeline, observations and deltas remain local under `.local/deadem/review-telemetry/<reviewTargetId>/`; committed artifacts contain only compact availability, hashes, counts, coverage and provenance.

Participant identifiers are replay-local controller references. Team and hero values are raw replay references. Lifecycle rows are `replay_observed_state`; death-counter or alive transitions do not establish a confirmed death and never emit killer, victim or assist. Damage and healing rows are positive deltas of aggregate counters without source-target attribution. Objective rows are raw configured entity observations. Position rows, when available, may carry only raw coordinates and mathematical displacement/speed, never named spatial semantics.

Every family is explicitly `available`, `partial`, `unavailable` or `unsafe_to_interpret`. The positive gate requires two safe timelines and at least two additional useful families per target. Missing optional families produce declared gaps, not fabricated values.

Final acceptance belongs exclusively to ChatGPT Work. Task 199 stops in `VALIDATING` and does not authorize replay-to-VOD synchronization or Task 200.
