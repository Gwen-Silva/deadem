# Task 129 - Diagnostic Fail-Closed Missing Entity Implementation

Status: completed

Gate: `diagnostic_fail_closed_missing_entity_implemented`

## Objective

Implement a minimal opt-in and disabled-by-default diagnostic fail-closed path for PacketEntities missing-entity failures, following the Task 128 contract.

## Result

Added `recovery.diagnoseMissingEntityFailClosed` to `ParserConfiguration`.

When the option is enabled, `DemoMessageHandler.handleSvcPacketEntities` records one compact `missing_entity_fail_closed` diagnostic at the existing missing-entity fail-fast boundary, then still throws the existing missing-entity error. The diagnostic records only permitted metadata and booleans proving no continuation, recovery, skip, placeholder, fake fields, synthetic registry state, or canonical facts.

## Validation Method

Replay_010 was not processed. The implementation was validated with a synthetic unit handler fixture that uses no replay bytes.

## Scope Held

- Default behavior remains disabled and unchanged.
- No recovery was implemented.
- No skip mode was implemented.
- No placeholder entity, fake fields, or synthetic registry state were created.
- No parser continuation occurs after the missing entity failure in diagnostic mode.
- No canonical, factual, source, spatial, macro, mechanics, fight, decision, or ML outputs were produced.
- Replay 005, replay_011, bot fixtures 006-008, candidates 012-020, `samples/**`, and `output/replays/**` were not touched or processed.
- Java, Clarity, external parsers, WSL, iaflow, and Product Reviewer automation were not used.
- No raw replay bytes, raw payloads, raw entityData, raw serializedEntities, string bytes, string values, field values, or full send-table payloads were versioned.
- Task 130 was not created.
