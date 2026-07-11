# Death Event Semantic Sequence Contract

## Boundary

`death_event_semantic_sequence_evidence` evaluates operational state sequences
around unconfirmed Task 183 counter anchors and exact Task 186 matched controls.
It does not emit or confirm deaths, respawns, attribution, or gameplay truth.

Part A gate `task185_186_audit_integrity_repaired` must pass before any replay
path is resolved or parser is constructed. Bounded processing additionally
requires the exact successful Task 187 pilot gate.

## Sequence Rules

The pre-state window is `[-3,-1]`. A family is stable when at least two
available samples agree; disagreement is conflicting and fewer than two samples
is insufficient. Raw states are held only in memory.

The forward window is `[-2,+2]`. Only health positive-to-non-positive,
boolean true-to-false, respawn non-positive-to-positive, and pawn-link
present-to-absent count forward. Exact opposites are opposing directions.
Signature recurrence and changed links remain recurrence only. A coherent
forward transition requires at least two forward families, no opposing
direction, and no ambiguity.

After a selected forward transition, its resulting abstract side must appear in
at least two consecutive normalized samples to count as persistent. Recovery in
`(0,180]` requires exact inverse pairs only. Coherent recovery requires at least
two inverse families plus recovery-side persistence. Replay-end censoring is
separate from recovery absence.

Each participant sequence begins at exactly one Task 183 anchor. A later anchor
before coherent recovery is a uniqueness violation. Sequence count must match
Task 183 candidates and every `sourceTransitionKey` is consumed exactly once.

Controls are the exact normalized seconds stored by Task 186. No new control is
selected. Anchor and control observations use identical rules and independent
association ledgers.

## Assessment

`strong` requires: exact 2,552 bridge; coherent forward rate at least 0.98;
uncensored coherent recovery at least 0.95; control coherent-sequence rate at
most 0.05; anchor-minus-control difference at least 0.90; zero coherent rows
with opposing direction; zero counter-before-recovery violations; zero sequence
bridge mismatches; at least 30/32 replays independently meeting forward and
recovery criteria; and zero technical failures.

`partial` requires forward rate at least 0.80 and anchor-minus-control
difference at least 0.50 without dominant contradictions. Otherwise evidence is
`insufficient`. These are operational criteria, not Source 2 truth.

Only `strong` may set `readyForOperationalDeathFactPromotionReview: true`. All
final-fact, confirmed-who-died, attribution, killer/victim, teamfight, and
gameplay-interpretation readiness remains false.

Runs publish artifacts all-or-nothing and preserve any prior successful active
directory when a replacement fails.
