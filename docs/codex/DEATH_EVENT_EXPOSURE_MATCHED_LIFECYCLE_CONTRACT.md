# Death Event Exposure-Matched Lifecycle Evidence Contract

## Truth boundary

Task 189 emits operational candidate evidence only. It does not establish a
death, respawn, participant identity, attribution, killer/victim relation,
teamfight, or gameplay meaning. Task 183 remains the temporal anchor and Task
186 supplies exact controls. Task 188 is historical comparison only.

## Origin continuity and equal exposure

A family pre-state is valid only when at least two agreeing samples in `[-3,-1]`
equal its forward origin, the immediately preceding observable state also equals
that origin, and no intervening transition breaks continuity. Expected origins
are health positive, boolean alive true, respawn boundary non-positive, and
pawn-link present.

Rows use only `stable_matching_forward_origin`,
`stable_wrong_forward_origin`, `insufficient_pre_state`,
`conflicting_pre_state`, or
`intervening_transition_breaks_continuity`. Only the first status can
participate in a complete family chain.

For each pair, anchor and control available follow-up are independently bounded
by 180 seconds, replay end, and their next real participant anchor. Both sides
are analyzed only through the smaller common follow-up. Pairs below 10 seconds
are insufficient and do not fabricate recovery absence.

Horizon reports are predeclared at 10, 20, 30, 60, 120, and 180 seconds. Each
uses only pairs with at least that much common exposure. Same-family lifecycle
completion still requires origin-continuous pre-state, exact forward, forward
persistence, exact inverse, and recovery persistence.

## Source tiers and assessment

Coherent evidence is classified as boolean/respawn only, health-supported,
pawn-supported, cross-surface-supported, or another combination. These probe
families are not described as statistically independent.

The serialized tier labels are `boolean_respawn_pair_only`,
`includes_health_boundary_support`, `includes_pawn_link_support`,
`includes_cross_surface_support`, and `other_two_family_combination`.

`strong` requires 2,552 exact pairs, eligible anchor coherence at least 0.90,
control coherence at most 0.05, difference at least 0.80, at least 90% of pairs
with 30 seconds common follow-up, at least 30/32 locally qualifying replays, and
zero technical failure. Cross-surface support below 50% keeps promotion review
false even if the operational assessment is strong.

A replay locally qualifies when origin-consistent pre-state coverage is at
least 0.90 and at least 90% of its pairs have 30 seconds of common follow-up.
The aggregate coherence and discrimination thresholds above remain separately
mandatory for `strong`.

`partial` requires anchor coherence at least 0.70, difference at least 0.40,
and non-dominant insufficient exposure/contradictions. Other results are
`insufficient`. Final-fact and attribution readiness always remain false.

## Audit and baseline treatment

Every measurement audit separates `integrityStatus`, `measurementStatus`, and
`thresholdStatus`; observed censoring or partial coverage is not an integrity
failure. The assignment ledger records cohort, synthetic participant and
observation keys, reference key, family, and forward/inverse stage in memory.
Reuse is calculated as total assignments minus unique observation assignments.

Tasks 180, 182, 183, 184, 185, and 186 remain active. Tasks 187 and 188 remain
historical sequence-v1 and segmented-lifecycle-v1 evidence. Task 189 supersedes
Task 188 only for origin continuity, exposure-matched control comparison, and
promotion readiness. No final fact or attribution capability is introduced.
