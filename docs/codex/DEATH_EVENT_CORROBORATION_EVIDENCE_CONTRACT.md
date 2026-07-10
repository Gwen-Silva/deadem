# Death Event Corroboration Evidence Contract

`death_event_corroboration_evidence` is a candidate-evidence layer. It uses each
Task 183 row only as a temporal anchor, verifies its Task 182 source bridge, and
associates independently observed replay signal changes through fixed normalized
time windows. It never promotes an anchor to a confirmed death.

## Independent Signal Candidates

The runner observes three bounded categories in memory:

- `life_signal_change_candidate` for controller or linked-pawn life-related
  signature changes, including health-boundary candidates;
- `pawn_link_change_candidate` for controller-to-pawn link changes;
- `respawn_signal_change_candidate` for respawn-related signature changes.

Continuously changing numeric values are not treated as repeated evidence.
Numeric health- or respawn-related probes contribute only bounded crossing
candidates; boolean-like probes contribute only when their signature changes.

Field names are probes, not proven Source 2 gameplay semantics. Raw field values,
handles, entity identifiers, ticks, and timestamps are never persisted.

## Temporal Association

- Near-event window: at most 2 normalized seconds before or after the Task 183
  anchor.
- Later-cycle window: greater than 0 and at most 180 normalized seconds after
  the anchor; this applies only to respawn-related signal candidates.

These windows are correlation heuristics. They do not prove death, survival,
return, respawn, causality, or correctness of any decision. Equidistant matches
are `ambiguous`; absence stays absence.

## Safe Consumption

Consumers may report the evidence class, the three candidate-observation
booleans, normalized delta seconds, and `confirmationStatus: unconfirmed`.
`counter_only` means no independent signal was uniquely associated. It is not
corroboration and not a parser failure.

Consumers must not report a confirmed death, "who died", killer, victim, assist,
damage, objective relation, position, teamfight, respawn fact, raw identity,
field value, or gameplay interpretation.

## Readiness Boundary

The layer may make replay-sourced corroboration evidence available, bounded
candidate-evidence consumption available, and multi-signal coverage measurable.
Final death facts, confirmed identity claims, attribution, killer/victim,
teamfight detection, and gameplay interpretation remain false and require a
separate future authorization.
