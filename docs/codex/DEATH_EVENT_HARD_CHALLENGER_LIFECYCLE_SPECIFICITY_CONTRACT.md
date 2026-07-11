# Hard-Challenger Lifecycle Specificity Contract

## Truth boundary

Task 192 compares Task 183 anchors with replay-sourced structural transition
clusters observed outside every participant anchor exclusion window. A cluster
is an unconfirmed structural challenger, never a known non-death, false death,
confirmed negative, death fact, or attribution fact.

The accepted Task 190 artifacts are the bounded replay-sourced observation
surface. Task 192 does not modify them, reparse protected fixtures, upgrade the
parser, or interpret the observed lifecycle as gameplay truth.

## Eligibility and exclusion

A challenger requires at least one forward surface transition with immediate
persistence in a Task 190 control observation. Its reference second must be
outside the declared exclusion radius around every Task 183 anchor for the same
synthetic participant. Exclusion radii 3, 5, and 10 seconds are emitted as a
sensitivity analysis; 5 seconds is primary.

Structural cluster identity is replay + synthetic participant + observed
forward-transition second, where the observed second is control reference plus
the family-specific forward delta. Families from one row may therefore belong
to different clusters. Multiple Task 190 evidence rows converging on the same
observed second are one challenger. Their control references and source event
keys remain provenance only. Follow-up,
horizon eligibility, lifecycle and surface opportunity are consolidated
conservatively by minimum/all-source agreement. Surface opportunity uses the
same 0/1/2 observable-surface scale as anchors: `surface_unavailable` is 0;
`controller_only`, `linked_pawn_only`, and `controller_link_relation` are 1;
`controller_and_pawn_agree` and `controller_pawn_conflict` are 2. Unknown
statuses fail closed. Each family takes the maximum observable surfaces across
its lifecycle stages; a source row takes the minimum across contributing
families; a cluster takes the minimum across source rows. Thus label diversity
cannot inflate opportunity above two. A cluster cannot match an
anchor present in its source provenance. Exclusion windows and time strata use
the observed transition second, never the control reference second.

## Independent matching

Horizons 10, 20, 30, 60, 120, and 180 seconds are recomputed independently.
Each horizon starts with empty anchor, challenger, and observation ledgers.
Matching is within replay and synthetic participant, prefers the same
five-minute time stratum, then minimum observable-surface opportunity distance,
then minimum reference-time distance, and requires
common observable follow-up. No source or assignment is reused within a
replay/horizon.

Reuse is computed from cluster identity (`sourceTransitionKey`), anchor key,
challenger key and assignment key. It is never inferred from the associated
anchor event key and is never written as an unchecked constant.

## Evidence and publication

Pilot and bounded-32 outputs include exact manifest membership, bridge status,
exclusion audit, per-horizon ledgers, truncation, surface opportunity,
ambiguity, reuse, sensitivity, per-replay and aggregate assessments. Runs are
published atomically. Schema validation and semantic invariants are both
required for a technical gate.

Specificity may be `strong`, `partial`, or `insufficient`. Every level remains
specificity to Task 183 reference anchors only. Final deaths, confirmed
who-died claims, attribution, killer/victim, teamfight, and gameplay
interpretation remain unavailable.
