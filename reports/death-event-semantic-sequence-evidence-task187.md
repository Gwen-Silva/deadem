# Task 187 Death Semantic-Sequence Evidence Report

## Outcome

Task 187 passed the integrity, pilot, and bounded-32 technical gates under
`task186_audits_corrected_death_semantic_sequence_bounded32_ready`. Its
operational semantic-sequence assessment is `partial`; it emits no final death
facts.

## Integrity repair

The strict precondition parses the task contribution index by exact `taskId`,
confirms Task 011 owns neither downstream SHA, and verifies the exact Task 185
and Task 186 ownership in completed files and project history. A regression
fixture proves that placing the Task 185 SHA in Task 011 is rejected.

The Task 185 correction audit derives its result from all 32 unchanged artifacts
and 2,552 rows. It accepts exact direction pairs only, excludes recurrence, and
lists every one of the 137 affected rows by synthetic replay-local keys. The
corrected result is 2,548 anchors with an explicit inverse pair and 2,297/2,297
uncensored inverse coverage.

## Pilot and bounded-32

The pilot completed 4/4 parsers and produced 341 rows, 341 anchors, and 341 exact
controls. The bounded run completed 32/32 parsers and produced 2,552 rows,
2,552 anchors, and 2,552 exact controls. Both used all-or-nothing publication,
passed Draft 2020-12 schema validation, mapping, bridge, output-policy,
protection, and size checks, and emitted zero final facts and attribution.

Bounded metrics:

- coherent forward sequence rate: 0.944357;
- uncensored coherent recovery rate: 0.909016;
- control coherent sequence rate: 0;
- anchor-minus-control difference: 0.852273;
- pre-state stability coverage: 0.999216;
- persistence coverage: 0.953762;
- opposing-direction anchors: 24;
- counter-before-recovery violations: 258;
- ambiguity and sequence-count bridge mismatches: 0;
- censored anchors: 134;
- stable replays meeting bounded forward/recovery criteria: 3/32;
- total run content: 6,977,092 bytes; largest artifact: 307,570 bytes.

Health, boolean-like alive, and respawn-boundary families contributed explicit
directions. Pawn-link presence contributed none. Recovery and lifecycle
uniqueness missed the predeclared strong criteria, so operational promotion
review is not ready.

## Readiness

Semantic-sequence evidence, lifecycle consistency measurement, anchor-control
discrimination measurement, and candidate-level consumption are available.
Final deaths, confirmed who-died, attribution, killer/victim, teamfight, and
gameplay interpretation remain unavailable.

## Task 188 correction notice

Task 188 preserved every historical Task 187 artifact and recalculated all
2,552 rows with same-family stage intersection, recovery-persistence
confirmation, and `[current anchor, next anchor)` boundaries. Prior coherent
rows were 2,175; corrected coherent segmented rows are 2,161. Forty-one prior
coherent rows cross the next anchor, 2,225 recovery times change because
persistence confirmation is required, and the intersection between the 258
historical counter-before-recovery violations and prior coherent rows is 59.

The corrected forward rate is 0.944357, corrected uncensored recovery rate is
0.904337, corrected anchor-minus-control difference is 0.846787, and the
assessment remains `partial`. Task 188 supersedes Task 187 only for corrected
same-family segmented coherence; Task 187 remains historical sequence-v1
evidence from commit `f5825e4ffc537e5986de699fd34d1a3df1a91b0f`.
