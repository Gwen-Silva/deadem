# Task 127 - Independent Missing Entity Strategy

Status: completed

Gate: `independent_missing_entity_strategy_ready`

Task 127 produced a minimal strategy decision package for the repeated PacketEntities `missing entity` failure class observed in replay_010 and replay_011.

The blocker summary consolidates:

- replay_010 failing on entity 2905 as a first missing UPDATE to a never-registered entity with a create/provenance gap;
- replay_011 failing in the same local PacketEntities lookup class on entity 5624;
- Clarity runtime being inactive in the current environment after Task 125 decided `oracle_inviavel_no_ambiente_atual`.

The static prior-art summary uses only local evidence already collected in Tasks 123-125. Each observation is categorized as `documented_behavior`, `inferred_behavior`, or `open_question`. No external parser was executed, no Java was installed, and no external repository was modified.

The selected next action is:

`add_diagnostic_fail_closed_review_next`

This is a strategy decision only. It does not implement or specify recovery, skip mode, placeholder entities, parser default behavior changes, or a parser fix. The next permitted task should remain a bounded diagnostic fail-closed review unless a later human-authored task explicitly authorizes broader parser intervention.

Protections held:

- parser and engine were not modified;
- no replay was processed;
- replay 005, bot fixtures 006-008, candidates 012-020, `samples/**`, and `output/replays/**` were not touched;
- WSL, iaflow, Product Reviewer automation, Java, Clarity, and external parser runtimes were not used;
- no canonical facts, source artifacts, match facts, spatial, macro, mechanics, fight, decision, or ML outputs were produced;
- Task 128 was not created.
