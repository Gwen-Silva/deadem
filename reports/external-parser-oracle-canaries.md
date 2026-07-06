# External Parser Oracle Canaries

Task 124 is a local-only feasibility comparison. It does not change local parser behavior, add recovery, build canonical outputs, or emit match facts.

## Task 123 Baseline

- Task 123 gate: replay_parser_prior_art_and_second_canary_triage_ready.
- Task 123 blocker classification: local_replay_class_issue.
- Task 123 recommendation: external_oracle_next.
- Replay 011 local failure: Unable to find an entity with index [ 5624 ].

## Oracle Feasibility

- skadistats/clarity: clone available_task123_local_clone; ref 7fb3f1d07564a12efa99194d45cfbf5762ba5910; Deadlock support found; build tool gradle-wrapper; blocker blocked_by_build_or_runtime.
- dotabuff/manta: clone available_task123_local_clone; ref 0efe7e11c40a4f149f6414b2d162320de34e8446; Deadlock support not_found; build tool go-module; blocker blocked_by_game_support.
- LaihoE/demoparser: clone available_task123_local_clone; ref e8c1ad452ced4d5938219ac9a5ee6300ee1ea37c; Deadlock support not_found; build tool rust-cargo; blocker blocked_by_game_support.
- markus-wa/demoinfocs-golang: clone available_task123_local_clone; ref b3758247207e33c63e7a07f25d10580cce644803; Deadlock support not_found; build tool go-module; blocker blocked_by_game_support.

## Canary Status

- Replay 010 local reference failure: Unable to find an entity with index [ 2905 ].
- Replay 011 local reference failure: Unable to find an entity with index [ 5624 ].
- Practical oracle execution attempted: false.
- No practical oracle currently available: true.

## Decision

- Recommended next action: manual_external_oracle_setup_needed.
- Tradeoff: A manual external oracle setup may turn clarity into a practical independent check, but it should stay local-only and produce compact summaries only.

## Protections

- No parser/engine default behavior was changed.
- No recovery, placeholder entity, fake field, canonical package, factual artifact, or match-analysis output was produced.
- Full command logs, external clones, and build/cache artifacts remain local-only under `.local/`.
- Replay 005, bot fixtures 006-008, candidates 012-020, samples, and output/replays were not used.
- No Task 125 was created.

## Gate

- external_parser_oracle_canaries_ready
