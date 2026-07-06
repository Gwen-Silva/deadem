# Independent Missing Entity Strategy

Task 127 consolidates the repeated PacketEntities `missing entity` blocker into a bounded strategy decision. It does not modify parser behavior, execute external parsers, install Java, process replays, or propose recovery/skip details.

## Blocker

- `replay_010` fails locally with `Unable to find an entity with index [ 2905 ]`.
- Entity 2905 was first observed as packet 954 loop 33 UPDATE with no prior CREATE, register attempt, class lookup, or baseline lookup in the committed diagnostics.
- Task 122 classified the replay_010 evidence as `never_registered_entity_with_create_gap`.
- `replay_011` loaded and failed in the same PacketEntities lookup class with `Unable to find an entity with index [ 5624 ]`.
- Clarity remains unavailable as a runtime oracle in the current environment and that does not validate the local parser.

## Static Prior Art

Static local prior-art evidence from Tasks 123-125 suggests mature parsers commonly treat UPDATE to a missing entity as an error path. This is decision evidence only. It is not Source 2 semantics, not replay-corruption evidence, and not a parser-fix specification.

Every prior-art observation in `static-prior-art-summary.json` is marked as `documented_behavior`, `inferred_behavior`, or `open_question`.

## Decision

The selected next action is:

`add_diagnostic_fail_closed_review_next`

This route reduces uncertainty by forcing the next local step to be a bounded diagnostic contract review rather than another open-ended replay_010 investigation. It avoids recovery, skip mode, placeholder entities, default behavior changes, new replay processing, Java setup, and external parser execution.

The future task permitted by this decision should review and define acceptance criteria for diagnostic fail-closed handling of missing-entity PacketEntities failures. It must not implement recovery, skip, placeholder entities, or parser default changes unless a later task explicitly authorizes that scope.

Gate: `independent_missing_entity_strategy_ready`.
