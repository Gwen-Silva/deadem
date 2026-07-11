# Replay-Wide Structural Hard-Challenger Census Contract

## Truth boundary

Task 193 measures the availability of replay-sourced structural transition
clusters. A cluster is neither a death nor a non-death and carries no negative
ground-truth label. The census does not run a lifecycle-specificity comparison.
Final deaths, confirmed who-died claims, attribution, killer/victim, teamfight,
and gameplay interpretation remain unavailable.

## Accepted bridges and replay protection

The accepted Task 180 identity, Task 183 anchors, Task 190 technical gate, and
Task 192 technical evidence are checked before replay-path resolution. Pilot
and bounded membership must be the exact Task 190 ordered manifests. Replays
005 through 008 are rejected before path resolution. Parser completion,
participant mapping, bridge failures, and protected access are independent
fail-closed counters.

## Observation and cluster identity

The implementation calls the same one-second controller, linked-pawn, and
controller-link observation and participant-mapping functions used by Task
190. Task 190 exports those existing functions without changing their
behavior; no parser package or accepted Task 190 artifact is modified.

Only forward observations whose same family and surface retain the observed
state at the next one-second sample satisfy immediate persistence. Persistent
family/surface observations are deduplicated by replay, synthetic participant,
and actual transition second. Source observation keys remain provenance.
Source and cluster reuse are derived from their ledgers and must both be zero.
No raw state, field, identity, tick, timestamp, or replay value is emitted.

## Exclusion and follow-up

Each cluster is compared with every Task 183 anchor for the same participant.
Eligibility is emitted independently for strict distances greater than 3, 5,
and 10 seconds; 5 seconds is primary. Follow-up is capped at 180 seconds and
ends earlier at replay end or immediately before the next participant anchor.
Eligibility counts are emitted at 10, 20, 30, 60, 120, and 180 seconds.

Surface opportunity is 0, 1, or 2: one for one observable abstract surface and
two for at least two, capped at two for compatibility with the accepted Task
192 covariate. Family and surface composition are descriptive census counts.

## Feasibility thresholds

The 30-second primary eligible-cluster count determines feasibility:

- `sufficient`: at least 100 clusters;
- `limited`: 30 through 99 clusters;
- `insufficient`: fewer than 30 clusters.

These thresholds authorize no follow-up comparison by themselves. A separate
Work gate would be required.

## Current execution blocker

This execution surface contains the accepted Task 190/192 artifacts but none
of the authorized replay files. Task 190 did not persist replay-wide
observations, so reconstructing the census from matched-control artifacts would
change the question and is forbidden. The technical gate is therefore
`replay_wide_hard_challenger_census_blocked`. The smallest unblock is to place
the exact authorized pilot and bounded-32 replay files at the documented local
paths and rerun Task 193 unchanged.
