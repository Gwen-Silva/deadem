# Death Event Segmented Lifecycle Evidence Contract

## Scope and truth boundary

Task 188 emits `death_event_segmented_lifecycle_evidence`. Rows are operational
candidate evidence only. They do not establish a death, respawn, participant
identity, attribution, killer/victim relation, teamfight, or gameplay meaning.

Task 183 supplies temporal anchors. Task 186 supplies the exact matched control
seconds. Task 187 is historical comparison only. Raw values are observed only
in memory and are never persisted.

## Predeclared sequence rules

Each participant anchor owns `[current anchor, next anchor)`. A final segment
ends at the earlier of anchor plus 180 normalized seconds and replay end. A
control ends at the earliest of control plus 180 seconds, replay end, and the
next real Task 183 anchor.

Health boundary, safely boolean-like alive, respawn boundary, and pawn-link
presence are evaluated independently. A family is complete only when the same
family has stable pre-state in `[-3,-1]`, exact forward direction in `[-2,+2]`,
two forward-side samples, its exact inverse before the segment boundary, and
two recovery-side samples. Recurrence never satisfies a stage.

A coherent segmented lifecycle requires at least two complete same-family
chains, no opposing forward direction, no ambiguity, no contradiction in a
participating family, no cross-anchor recovery, exact bridges, and no source
reuse. Recovery completion is the second participating family's inverse plus
its persistence-confirmation sample.

## Operational assessment

`strong` requires all of: 2,552 exact anchors and controls; anchor coherence at
least 0.95; control coherence at most 0.05; difference at least 0.90; at least
30/32 replays independently meeting forward, persistence, and recovery
thresholds; no cross-anchor recovery counted coherent; no bridge/reuse or
technical failure.

`partial` requires anchor coherence at least 0.75, difference at least 0.50,
and cross-anchor/contradiction cases not dominating. Other results are
`insufficient`. These thresholds do not prove Source 2 semantics.

Only `strong` may make a separate operational-promotion review eligible. Task
188 always keeps final-death, confirmed-who-died, attribution, killer/victim,
teamfight, and gameplay-interpretation readiness false.
