# Task 189 Exposure-Matched Death Lifecycle Evidence Report

## Outcome

Task 189 passed the pre-open integrity, exact pilot, and bounded-32 technical
gates under `task188_corrected_exposure_matched_lifecycle_bounded32_ready`.
Its operational assessment is `partial`; it emits no final death facts,
attribution, identities, raw values, or gameplay interpretation.

Task 189 equalizes observable follow-up within each anchor-control pair. It
does not remove event-window asymmetry, risk-set differences, reference-time
selection effects, signal-family coupling, or mixed-horizon interpretation.
Task 189 is preserved as historical exposure-matched-v1 evidence.

## Integrity and Task 188 correction

Task 188 commit `58af2f44016e061fcbda140bc6928e0c4dc4970d`
is structurally assigned only to Task 188. All Task 180/182/183/186/188
provenance, row-count, participant membership, and row bridges are validated
before replay-path resolution. Because Task 182 does not carry hero/team refs,
those refs are bridged transitively through the exact Task 180 participant row
and then compared with Task 183. The mutation-tested assignment ledger derives
reuse from total minus unique observation assignments; bounded reuse is zero.

The isolated Task 188 origin correction kept 2,161/2,161 prior coherent rows.
Wrong-origin invalidations, intervening-transition invalidations, changed
classes, and changed recovery times are all zero. Per-family matching-origin
rates are 0.999216 for health, boolean, and respawn boundary, and 1 for pawn
link. Historical Task 188 artifacts were not modified.

## Pilot and bounded-32

Pilot completed 4/4 parsers with 341 anchors, exact controls, pairs, and rows.
Bounded-32 completed 32/32 parsers with 2,552 anchors, exact controls, pairs,
and rows. Both runs passed schema, policy, mapping, provenance, bridge,
protection, size, reuse, and all-or-nothing gates with zero final facts and
attribution.

Bounded common-follow-up distribution:

- under 10 seconds: 51 pairs;
- 10-19: 129; 20-29: 116; 30-59: 450;
- 60-119: 835; 120-179: 407; 180: 564.

Horizon results (eligible pairs, anchor rate, control rate, difference):

| Horizon | Eligible | Anchor | Control | Difference |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 2,501 | 0.086765 | 0 | 0.086765 |
| 20 | 2,372 | 0.225548 | 0 | 0.225548 |
| 30 | 2,256 | 0.345301 | 0 | 0.345301 |
| 60 | 1,806 | 0.594131 | 0 | 0.594131 |
| 120 | 971 | 0.897013 | 0 | 0.897013 |
| 180 | 564 | 0.890071 | 0 | 0.890071 |

Across all pairs, per-family anchor/control completion rates are health
0.006661/0, boolean 0.782915/0, respawn boundary 0.710031/0, and pawn link 0/0.
Among the 2,501 pairs meeting the minimum horizon, anchor coherence is 0.715714,
control coherence is 0, and the paired difference is 0.715714. There are 51
insufficient pairs, 1,688 controls truncated by real anchors, 1,194 anchors
truncated by next anchors, 122 cross-anchor observations excluded from prior
recovery, 17 contradictions, zero ambiguities, and zero reuse.

## Source tiers and readiness

Boolean/respawn-only support accounts for 0.992179 of coherent anchors;
cross-surface support is 0.007821. Only 12/32 replays meet the declared local
stability criteria. The `partial` assessment and low cross-surface support keep
`readyForOperationalDeathFactPromotionReview` false. Final facts, confirmed
who-died claims, attribution, killer/victim, teamfight, and gameplay
interpretation remain false.
