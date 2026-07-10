# Death Event Candidate Consumption Contract

`death_event_candidates` is a compact, policy-safe candidate layer. It is
derived from Task 182 `life_state_transition_candidates` plus Task 180
`participant_identity` artifacts. It does not read replay files and does not
emit final gameplay facts.

## Allowed Use

Consumers may answer only bounded candidate questions such as:

- "Synthetic participant `participant_##` has a death-counter increment
  candidate at normalized second `N`."
- "Synthetic hero ref `hero_ref_##` has a death-counter increment candidate at
  normalized second `N`."
- "Synthetic team ref `team_ref_##` has a death-counter increment candidate at
  normalized second `N`."

These answers must preserve the candidate status. The phrase "candidate" is
required whenever the row is discussed.

## Required Interpretation

- `sourceObservationConfidence: high` means confidence in the observed source
  counter-increment candidate, not death truth.
- `deathTruthStatus: unconfirmed_candidate` means the row is not a confirmed
  death event.
- `participantKey`, `heroRefKey`, and `teamRefKey` are synthetic, replay-local
  references.
- `normalizedElapsedSecond` is a safe normalized time reference, not a raw tick
  or raw timestamp.

## Prohibited Claims

Consumers must not claim:

- "`X` died."
- "`X` was killed by `Y`."
- "This is a confirmed death."
- "This death happened in a teamfight."
- "This candidate proves a respawn."
- "This candidate proves damage, objective relation, decision quality, or
  gameplay causality."

## Prohibited Data

Consumers must not emit or reconstruct player names, hero names, team names,
raw entity IDs, field values, raw ticks, raw timestamps, positions, killer,
victim, assists, final death facts, final respawn facts, teamfight events, or
gameplay interpretation.

## Current Readiness

The layer is ready for policy-safe death-event candidate consumption. It is not
ready for final death-event emission, attribution, teamfight detection, or
gameplay interpretation.
