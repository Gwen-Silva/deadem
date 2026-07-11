# Death Event Surface-Resolved Lifecycle Evidence Contract

## Truth boundary

Task 190 emits replay-sourced operational candidate evidence only. It does not
establish death, respawn, identity, attribution, killer/victim, teamfight, or
gameplay meaning. Task 183 remains the anchor, Task 186 supplies exact controls,
and Task 189 is immutable historical exposure-matched-v1 context.

Task 189 equalizes observable follow-up within each pair; it does not remove
event-window asymmetry, risk-set differences, reference-time selection effects,
signal-family coupling, or mixed-horizon interpretation.

## Event-relative symmetry

The nearest unique forward candidate is selected symmetrically in `[-2,+2]`.
Equal-distance candidates are ambiguous. Once the transition second `F` is
selected, pre-state is evaluated in `[F-3,F-1]`. At least two available samples
must agree with the expected origin, `F-1` must exist and match, and no conflict
or intervening same-family transition is allowed. Only
`event_relative_origin_continuous` can complete a family.

Expected origins are positive health boundary, boolean true, non-positive
respawn boundary, and present controller-to-pawn link. Raw values and field
names remain memory-only.

## Independent horizons and fixed cohort

Horizons 10, 20, 30, 60, 120, and 180 seconds are each independently rematched
with fresh anchor/control assignment ledgers. Eligible denominators include
only pairs with enough common follow-up. The primary operational horizon is 30
seconds.

The fixed-cohort curve uses only pairs eligible for 180 seconds and independently
measures cumulative completion at all six horizons. It is labeled
`fixed_180_second_cohort`; changing-denominator results are labeled
`horizon_specific_eligible_cohort` and are not presented as longitudinal.

## Surface provenance

Controller, linked-pawn, and controller-link observations are retained as
separate abstract surfaces before matching. Each lifecycle stage records one of
`controller_only`, `linked_pawn_only`, `controller_and_pawn_agree`,
`controller_pawn_conflict`, `controller_link_relation`, or
`surface_unavailable`.

Row support classes are boolean/respawn same-surface, health-supported
same-surface, controller-and-pawn support, controller-link support, multiple
distinct surfaces, conflicted, unresolved, or not coherent. Health support
alone is not cross-surface. `actualCrossSurfaceSupport` requires at least two
demonstrably distinct abstract surfaces. Signal families are not statistically
or causally independent.

## Truncation and assessment

Anchor and control available follow-up independently record whether the minimum
was caused by the next real participant anchor, replay end, the 180-second
policy cap, or tied causes. The pair separately records the limiting side.

At 30 seconds, `strong` requires at least 90% eligibility, anchor rate at least
0.70, control rate at most 0.05, difference at least 0.60, 30/32 locally strong
replays, and zero technical/reuse failures. `partial` requires at least 80%
eligibility, anchor rate at least 0.30, difference at least 0.25, control rate at
most 0.10, and non-dominant contradiction/insufficiency. Other results are
`insufficient`. Local criteria use the same 30-second rate thresholds within a
replay.

Operational association is not truth. Promotion review additionally requires
`strong`, actual multi-surface support of at least 50%, and every technical and
invariant gate.

## Invariants and audit statuses

Full artifact integrity means Draft 2020-12 schema validation plus semantic
invariants for pair arithmetic, truncation labels, family counts, coherence,
completion limits, support class, evidence class, source bridges, summaries,
horizon rates, readiness, and final-fact boundaries. Schema-only success is
never reported as full integrity.

Every audit separates `integrityStatus`, `measurementStatus`,
`operationalThresholdStatus`, and `promotionSupportThresholdStatus`. The final
gate separately exposes technical status, operational assessment/threshold,
and surface-support threshold.

Tasks 180, 182, 183, 184, 185, and 186 remain active. Tasks 187, 188, and 189
remain historical v1 evidence. Task 190 supersedes Task 189 only for event
symmetry, independently rematched horizons, surfaces, truncation accounting,
audit semantics, and promotion readiness.
