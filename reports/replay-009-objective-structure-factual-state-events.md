# Replay 009 Objective/Structure Factual State Events

Task 063 converts Task 062 compact class, property, and lifecycle observability into bounded factual events. It does not parse new replay fixtures, apply mechanics, project map positions, infer objective completion, or interpret strategy.

## Result

- Gate: `replay_009_objective_structure_factual_events_ready_with_gaps`
- Entity generations normalized: 56
- Factual events emitted: 583
- Duplicate events removed: 0
- Lifecycle violations: 0
- Mechanic effects applied: 0

## Mechanic Summary

| Mechanic | Entities | Events | Terminal sequences |
| --- | ---: | ---: | --- |
| mid_boss | 2 | 28 | deleted_without_observed_zero: 2 |
| guardian | 8 | 48 | present_until_replay_end: 8 |
| walker | 6 | 82 | deleted_without_observed_zero: 4, present_until_replay_end: 2 |
| patron_base | 20 | 247 | deleted_without_observed_zero: 12, present_until_replay_end: 8 |
| spirit_urn | 20 | 178 | deleted_without_observed_zero: 9, health_zero_then_deleted: 5, present_until_replay_end: 6 |
| rejuvenator | 0 | 0 | none |

## Safe Outputs

- Mid Boss raw entity lifecycle and sampled health events.
- Guardian, Walker, and Patron/base raw entity lifecycle, team, state, and sampled health events.
- Spirit Urn candidate lifecycle/property events only.

## Still Prohibited

- Health zero is not a kill/destruction conclusion.
- Entity deletion is not a destroyed, secured, claimed, or deposited conclusion.
- Rejuvenator effects, Urn effects, mechanic activation, spatial contest/proximity, and macro interpretation remain blocked.

## Validation

- Focused factual-event tests were added.
- JSON/JSONL validation and deterministic rerun are required before commit.
- Replay 005 and bot fixtures 006-008 were not processed or inspected.
