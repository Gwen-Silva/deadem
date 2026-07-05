# Five-Human-Replay Factual Pilot Plan

This is the finite execution plan after Task 093 consolidation.

The pilot includes exactly:

- `replay_001`
- `replay_002`
- `replay_003`
- `replay_004`
- `replay_009`

It excludes:

- `replay_005`: protected final holdout
- `replay_006`: unsupported bot fixture
- `replay_007`: unsupported bot fixture
- `replay_008`: unsupported bot fixture

## Task 094: Finalize Replay 002 Terminal Validation

Purpose: resolve only the four frozen replay-002 blockers:

1. terminal manifest freshness;
2. evidence-only determinism representation;
3. strict scope containment;
4. intraprocedural and order-aware IO guard analysis.

Success gate:
`replay_002_canonical_factual_state_ready_with_constraints_v9`.

Blocked gate:
`replay_002_canonical_factual_state_v9_blocked`.

Non-goals: do not process replay 005, do not process bot fixtures 006-008, do
not apply spatial semantics or mechanic effects, and do not create analysis of
fights, rotations, pressure, macro, roles, or decision quality.

## Task 095: Canonicalize Remaining Human Pilot Replays

Included replays:

- `replay_001`
- `replay_003`
- `replay_004`

Purpose: create a generic batch entrypoint using the existing canonical core and
process the three remaining human controls without replay-specific branches.

Success gate: `remaining_human_controls_canonicalized`.

Blocked gate: `remaining_human_controls_canonicalization_blocked`.

Non-goals: do not process replay 005, do not process bot fixtures 006-008, and
do not emit spatial, mechanic-effect, fight, rotation, pressure, macro, or
decision analysis.

## Task 096: Audit Five Human Replay Factual Pilot

Included replays:

- `replay_001`
- `replay_002`
- `replay_003`
- `replay_004`
- `replay_009`

Purpose: audit schema compatibility, provenance, failures, processing duration,
memory, storage, caching, and readiness to expand to 15 replays.

Success gate: `five_human_replay_factual_pilot_ready`.

Blocked gate: `five_human_replay_factual_pilot_blocked`.

## Mandatory Stop

After Task 096:

- do not create Task 097 automatically;
- do not release replay 005;
- do not begin spatial, mechanics, ML, macro, fight, rotation, pressure, or
  decision analysis;
- wait for a human milestone decision.

## Review Boundary

Tasks 094-096 each allow one correction pass. A review may add a new blocker
only when the issue makes a required output factually incorrect, produces a
false positive gate, accesses protected data, changes canonical facts without
authorization, or prevents the declared result. Other findings become backlog
after Task 096.
