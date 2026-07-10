# Death Event Directional Discrimination Contract

## Purpose And Boundary

`death_event_directional_discrimination_evidence` compares replay-sourced
signal patterns around unconfirmed Task 183 counter anchors with deterministic
matched non-anchor control times. It measures association discrimination only.
It never confirms a death, respawn, participant outcome, attribution, or
gameplay interpretation.

Task 183 remains the temporal anchor. Tasks 184 and 185 are context and
historical observation baselines only; their booleans and counts are not copied
as Task 186 discrimination evidence. All Task 186 observations are reproduced
from authorized replay processing.

## Explicit Direction And Inversion

Only these exact pairs are directional and invertible:

- health boundary: positive-to-non-positive and non-positive-to-positive;
- safely boolean-like alive: true-to-false and false-to-true;
- respawn boundary: non-positive-to-positive and positive-to-non-positive;
- pawn-link presence: present-to-absent and absent-to-present.

The runner observes raw values only in memory and persists abstract classes.
Life-state signature changes, unknown respawn-signature changes, changed pawn
links, conflicting directions, and other ambiguous/unknown-direction changes
are recurrence evidence only. They never increment directional or inverse-cycle
family counts and are never called inverse, recovery, return, or cycle evidence.

## Temporal Association

Both cohorts use identical rules:

- anchor-side window: `[-2, +2]` normalized seconds;
- later explicit inverse window: strictly after the reference time and at most
  180 normalized seconds after it;
- at most one observation per abstract source family and reference row;
- equidistant candidates are ambiguous and do not become positive evidence;
- an observation is not reused across rows within one analytical cohort.

Anchor and control cohorts have independent reuse ledgers. Cross-cohort reuse
is permitted only as comparative measurement: control evidence is not reduced
because an observation was associated with a real anchor, and no observation is
thereby duplicated within either cohort.

Replay-end censoring is recorded separately and is not a failed semantic cycle.

## Deterministic Matched Controls

For every Task 183 anchor the runner attempts one control with:

- the same replay and synthetic participant;
- the same match-time quartile, calculated from normalized observable replay
  time in memory;
- a normalized second at which that participant was actually observed;
- at least 180 observable future seconds;
- no overlap between its `[-2,+2]` association window and any Task 183 anchor
  window in that replay;
- no overlap with another selected `[-2,+2]` control window.

Candidate seconds are searched in a deterministic circular order starting from
a stable event-key-derived position inside the eligible observed-second list.
No signal is synthesized. If no candidate satisfies every rule, control status
is `unavailable` and the reason is recorded.

## Predeclared Assessment

These thresholds are operational design rules, not proof of gameplay truth.

`strong` requires all of:

- matched-control availability at least 0.90;
- anchor multi-family explicit-direction rate at least 0.90;
- uncensored anchor explicit-inverse rate at least 0.80;
- matched-control multi-family direction rate at most 0.15;
- uncensored matched-control inverse rate at most 0.10;
- anchor-minus-control multi-family direction difference at least 0.60;
- zero technical, protection, mapping, schema, output-policy, source-reuse, or
  control-selection integrity failures.

`partial` applies when strong does not and at least one of these differences is
at least 0.25:

- anchor versus control multi-family explicit-direction rate;
- anchor versus control uncensored explicit-inverse rate.

`insufficient` applies when neither threshold passes, control coverage is too
low, ambiguity dominates, only recurrence separates the cohorts, or results are
unstable across most replays.

Even `strong` may only make a separate final death semantic contract design
eligible. Final death facts, confirmed who-died claims, attribution,
killer/victim, teamfight detection, and gameplay interpretation remain false.

## Execution Integrity

Before a bounded manifest resolves replay paths or constructs a parser, the
runner validates the exact Task 186 pilot manifest identity and its 4/4 parser,
mapping, schema, policy, reuse, protection, and control-selection requirements.

Runs publish per-replay artifacts only after every replay and technical gate
passes. A failed run writes only a blocked gate, summary, and failure audits to
a separate blocked-run directory and preserves any prior successful run
directory unchanged.
