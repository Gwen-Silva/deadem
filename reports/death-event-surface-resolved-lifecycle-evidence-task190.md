# Task 190 Surface-Resolved Death Lifecycle Evidence Report

## Outcome

Task 190 passed the pre-open integrity, exact pilot, and bounded-32 technical
gates under
`task189_corrected_surface_resolved_lifecycle_bounded32_ready`. The operational
assessment is `partial`; surface support meets its separate threshold, but
operational promotion review remains false. No final death fact, attribution,
raw replay value, raw identity, raw time, or gameplay interpretation is
emitted.

Task 189 commit `ac04dcc5c168da306fada4f6d32f590c39c16721` is
recorded on Task 189 only. Task 189 equalizes observable follow-up within each
pair; it does not remove event-window asymmetry, risk-set differences,
reference-time selection effects, signal-family coupling, or mixed-horizon
interpretation. Its artifacts remain immutable historical
exposure-matched-v1 context.

## Integrity and repaired measurement

All Task 180/182/183/186/189 provenance, counts, membership, transitions,
controls, and complete row bridges passed before replay-path resolution,
`Player` construction, or stream creation. Every 10/20/30/60/120/180-second
horizon and the fixed-180 cohort curve were independently rematched with fresh
assignment ledgers. Duplicate assignments and source reuse are zero.

Forward association uses the nearest unique candidate in `[-2,+2]`; equal
distances remain ambiguous. Pre-state is evaluated in `[F-3,F-1]` relative to
the selected forward event and requires the immediate `F-1` sample. Abstract
controller, linked-pawn, and link-relation provenance is retained at every
lifecycle stage. Replay values, field names, handles, raw IDs, and raw time are
not serialized.

The Task 189 correction audit does not rewrite historical artifacts. It
reclassifies all 2,552 rows under the event-relative and independently
rematched Task 190 contract; one formerly coherent 30-second anchor is
invalidated. At 30 seconds, the historical/current anchor rates are
0.345301/0.907358 and control rates are 0/0.000887. Two coherent controls are
recovered from negative-offset association; no coherent anchor is recovered
at a negative offset.

## Pilot and bounded-32

Pilot completed 4/4 parsers with 341 anchors, exact controls, pairs, and rows.
Bounded-32 completed 32/32 parsers with 2,552 anchors, exact controls, pairs,
and rows. Both runs passed schema, semantic invariants, mapping, provenance,
bridges, replay protection, output policy, size, source reuse, and atomic
publication with zero final facts and attribution.

Bounded common-follow-up distribution:

- under 10 seconds: 51 pairs;
- 10-19: 129; 20-29: 116; 30-59: 450;
- 60-119: 835; 120-179: 407; 180: 564.

Independently rematched horizon results:

| Horizon | Eligible |   Anchor |  Control | Difference |
| ------: | -------: | -------: | -------: | ---------: |
|      10 |    2,501 | 0.788884 |   0.0012 |   0.787684 |
|      20 |    2,372 | 0.858347 | 0.000843 |   0.857504 |
|      30 |    2,256 | 0.907358 | 0.000887 |   0.906471 |
|      60 |    1,806 | 0.967885 |        0 |   0.967885 |
|     120 |      971 | 0.991761 |        0 |   0.991761 |
|     180 |      564 | 0.989362 |        0 |   0.989362 |

The independently rematched fixed-180 cohort contains 564 pairs. Its anchor
completion curve is 0.966312, 0.971631, 0.973404, 0.984043, 0.989362, and
0.989362 at 10, 20, 30, 60, 120, and 180 seconds; control coverage is zero at
all six horizons.

Cause-specific anchor truncation counts are 989 next-participant anchors, 205
replay ends, 1,349 policy caps, and 9 ties. Control counts are 1,688 next real
participant anchors, 857 policy caps, and 7 ties. The common window is limited
by the anchor side for 525 pairs, the control side for 1,459, and equally for 568.

## Surfaces and readiness

At the primary 30-second horizon, eligibility is 0.884013. Anchor/control
coherent lifecycle rates are 0.907358/0.000887 and the paired difference is
0.906471. Actual multi-surface support is 0.9702 and health supports 0.993161
of coherent anchors. There are 19 contradictions, 158 cross-boundary recovery
observations, zero ambiguities, and zero source reuse.

Only 12/32 replays meet local strong criteria and aggregate eligibility is
below 0.90. The predeclared strong criteria therefore do not pass, so
`readyForOperationalDeathFactPromotionReview` is false. Task 190 supersedes
Task 189 only for event-relative association, independently rematched
horizons, surface provenance, truncation accounting, audit semantics, and
promotion readiness. Final facts, confirmed who-died claims, attribution,
killer/victim, teamfight, and gameplay interpretation remain false.
