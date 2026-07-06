# Replay Parser Prior Art And Second Canary Triage

Task 123 is diagnostic triage only. It does not change parser behavior, add recovery, create canonical outputs, or emit match facts.

## Replay 010 Current Blocker

- Task 122 classification: never_registered_entity_with_create_gap.
- Packet 954 status: bounded_no_trailing_signs_comparable_to_packet_953.
- External comparison status: supported_for_error_on_missing_update.

## External Prior Art

- Status: inspected_local_only.
- skadistats/clarity: available_local_clone; missing UPDATE policy error; ref 7fb3f1d07564a12efa99194d45cfbf5762ba5910.
- dotabuff/manta: available_local_clone; missing UPDATE policy error; ref 0efe7e11c40a4f149f6414b2d162320de34e8446.
- LaihoE/demoparser: available_local_clone; missing UPDATE policy error, not_found; ref e8c1ad452ced4d5938219ac9a5ee6300ee1ea37c.
- markus-wa/demoinfocs-golang: available_local_clone; missing UPDATE policy error, warning_or_ignore_when_configured; ref b3758247207e33c63e7a07f25d10580cce644803.

## Second Canary

- Replay 011 result: second_canary_same_missing_entity_class.
- Load succeeded: true.
- Ticks advanced: 1051.
- First error: Unable to find an entity with index [ 5624 ].
- Same missing-entity class: true.

## Replay 010 Versus 011

- Same class repeated: true.
- Timing: after_replay_010_region.

## Recommendation

- Blocker classification: local_replay_class_issue.
- Recommended next action: external_oracle_next.
- Tradeoff: Uses mature parser behavior as an independent check before changing local parser contracts; requires local-only setup and careful output hygiene.

## Protections

- No replay 005, bot fixtures 006-008, candidates 012-020, samples, or output/replays paths were used.
- No raw replay bytes, raw entity data, serialized entities, payloads, string bytes, field values, external source trees, .dem files, or .local files are committed.
- No Task 124 was created.

## Gate

- replay_parser_prior_art_and_second_canary_triage_ready
