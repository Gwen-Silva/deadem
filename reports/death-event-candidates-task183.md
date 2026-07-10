# Task 183 - Death Event Candidates

Gate: `task181_docs_corrected_death_event_candidates_bounded32_ready`

Task 183 corrected the remaining Task 181/182 documentation consistency issues
and introduced the `death_event_candidates` compact artifact class.

## Documentation Correction

- Task 181 is bridge-only scaffolding, not active transition coverage.
- Task 181 commit is recorded as `15f276cc1859045f96c2d4a75ba9f5d1d1d61f80`.
- Task 182 commit is recorded as `5f0a07c03938eef513d0c7288344d93b55393155`.
- Task 182 remains the active replay-sourced transition baseline:
  `life_state_transition_candidates_bounded32_task182`.

## Emission

The runner transformed only versioned artifacts:

- Task 180 `participant_identity`
- Task 182 `life_state_transition_candidates`

It did not open replay files, execute the parser, or run any replay processing.

## Results

- Pilot gate: `death_event_candidates_pilot_ready`
- Pilot replays: replay_010, replay_011, replay_021, replay_036
- Pilot candidates: 341
- Bounded-32 gate: `death_event_candidates_bounded32_ready`
- Bounded-32 artifacts: 32
- Bounded-32 candidates: 2,552
- Participant refs mapped: 2,552
- Hero refs mapped: 2,552
- Team refs mapped: 2,552
- Normalized-time rows: 2,552
- Unmapped candidates: 0
- Duplicate candidates: 0
- Source bridge: matched, 2,552 / 2,552

## Consumption Boundary

The artifact can support bounded candidate phrasing such as:

> Synthetic participant `participant_##` has a death-counter increment candidate
> at normalized second `N`.

It cannot support final claims that a player died, who killed whom, whether a
teamfight occurred, respawn facts, damage, objective relation, or gameplay
causality.

## Protections

- No `.dem` file was opened, hashed, inspected, copied, or parsed.
- No parser, Player, batch replay runner, Java, Clarity, WSL, iaflow, or Product
  Reviewer automation was used.
- No raw IDs, field values, raw ticks, raw timestamps, positions, attribution,
  final facts, or gameplay interpretation were emitted.
- `packages/deadem/**` and `packages/engine/**` were not modified.
- Task 184 was not created.

## Next Step

The next useful step is either a candidate-safe consumption surface that
preserves the `unconfirmed_candidate` wording, or a separate design review for
final death-event confirmation criteria. Attribution and teamfight detection
remain blocked.
