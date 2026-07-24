# Functional Death-Candidate Detector Contract

Version: `task_196_mvp_v1`

## Input

One replay from the exact accepted bounded-32 membership. Replay 005 remains
the protected final holdout and replays 006-008 remain unsupported bot
fixtures. Membership and accepted Task 190/192/195 bridges must pass before
replay path resolution or parsing.

## Detection rule

The detector reuses the accepted one-second structural observation path and
scores immediately persistent forward-transition clusters. The transparent
score is capped at 1.0 and contains only:

- 0.30 for immediate persistence;
- 0.10 per distinct structural signal family, capped at three families;
- 0.10 per abstract observation surface, capped at two surfaces;
- up to 0.20 for observed follow-up, reaching the full contribution at 30
  seconds.

The MVP emits non-ambiguous clusters with score at least 0.85. Known-anchor and
hard-challenger overlaps are evaluation annotations only and never contribute
to the score.

## Candidate output

Every candidate contains a replay-relative timestamp in seconds, structural
score, weighted contributing signals, largest standard observed horizon,
abstract participant/surface identifier and evaluation overlap flags. Candidate
identity is deterministic within a stable replay ordering.

Every row is explicitly
`unconfirmed_structural_death_candidate` with `finalFact: false`.

## Semantic boundary

A candidate is a structural hypothesis. It is not a confirmed death, confirmed
non-death, victim, killer/victim relation, attribution, teamfight or gameplay
interpretation. Accuracy calibration and semantic confirmation require
separate evidence and authorization.
