# Parser Failure Catalog

Last updated: 2026-06-29

## Investigation Policy

After two sequential parser blockers at the same boundary, stop serial symptom repair and run an assessment experiment.

Parser investigations must not fabricate entities, create empty fabricated baselines, substitute neighboring classes, silently suppress warnings, or derive downstream semantic analysis from unstable continuation.

## Known Failures

### replay_006 default_parser

- Replay: `samples/partida_006.dem`
- Task: 046 parser compatibility matrix
- Build/protocol: direct build `unavailable`, demo protocol `unavailable`, network protocol `unavailable`
- Tick/time: 3808 / 119s
- Failure category: `entity_not_found`
- Raw error: `Unable to find an entity with index [ 5594 ]`
- Immediate cause: missing entity reference 5594
- Root cause status: diagnostic classification only
- Recovery attempted: none
- Continuation result: final tick 3807, completed false
- Downstream telemetry trustworthy: no
- Related evidence: `output/parser-compatibility/parser-compatibility-matrix.json`

### replay_006 diagnostic_recovery

- Replay: `samples/partida_006.dem`
- Task: 046 parser compatibility matrix
- Build/protocol: direct build `unavailable`, demo protocol `unavailable`, network protocol `unavailable`
- Tick/time: 3808 / 119s
- Failure category: `class_not_found`
- Raw error: `Class not found [ 891 ]`
- Immediate cause: missing class metadata 891
- Root cause status: diagnostic classification only
- Recovery attempted: existing opt-in entity and baseline recoveries only
- Continuation result: final tick 3807, completed false
- Downstream telemetry trustworthy: no
- Related evidence: `output/parser-compatibility/parser-compatibility-matrix.json`

## Replay 006 Sequential Boundary

Replay 006 / match 91119257 exposes this known sequence at the same parser boundary:

1. `entity_not_found`: entity 5594 missing UPDATE.
2. `baseline_not_found`: baseline 709 missing before CREATE.
3. `class_not_found`: class 891 after limited recovery.

These are sequentially exposed blockers at the same parser boundary, not three independently fixed issues. No class-891-specific recovery is authorized.

## Current Gate

`parser_compatibility_matrix_ready_with_insufficient_diversity`


## Structural Replay Stream Pass

Task 047 adds a structural pass that reads replay headers, command envelopes, packet/message boundaries, offsets, sizes, monotonicity, malformed boundaries, and unknown IDs without invoking entity registries, baselines, classes, serializers, positions, or gameplay events.

- Gate: `structural_replay_pass_ready`
- Selected interpretation: `replay_006_state_reconstruction_failure`
- Replay 006 tick 3808 framing valid: true
- Replay 006 later ticks structurally reachable: true
- Completion count: 5/5


## Replay 006 State Reconstruction Divergence

- Gate: `replay_006_divergence_narrowed_not_confirmed`
- First localized invalid precondition: missing_entity_for_update
- Tick: 1163
- Command/message: 1234 / 55
- Affected state table: entity_registry
- Policy: no entity-, baseline-, or class-specific skip was added.


## Replay 006 State Reconstruction Divergence

- Gate: `replay_006_divergence_narrowed_not_confirmed`
- First localized invalid precondition: parser_exception
- Tick: 3808
- Command/message: 3880 / 14
- Affected state table: entity_registry
- Policy: no entity-, baseline-, or class-specific skip was added.


## Replay 006 State Reconstruction Divergence

- Gate: `replay_006_divergence_narrowed_not_confirmed`
- First localized invalid precondition: parser_exception
- Tick: 3808
- Command/message: 3880 / 14
- Affected state table: entity_registry
- Policy: no entity-, baseline-, or class-specific skip was added.


## Replay 006 State Reconstruction Divergence

- Gate: `replay_006_divergence_narrowed_not_confirmed`
- First localized invalid precondition: parser_exception
- Tick: 3808
- Command/message: 3880 / 14
- Affected state table: entity_registry
- Policy: no entity-, baseline-, or class-specific skip was added.

## Replay 006 Entity Lifecycle Gap

- Gate: `replay_006_entity_lifecycle_narrowed_not_confirmed`
- Failing operation: loop 29, update, index 5594
- Production fix: none included.

## Replay 006 External Parser Oracle Comparison

- Gate: `external_oracle_comparison_ready_without_resolution`
- Upstream `Igor-Losev/deadem` commit: `207fe497e8bf909a1208ac6b9a62f43b640a781a`
- Upstream controls: `partida_001.dem` and `partida_002.dem` parsed completely.
- Upstream replay 006 result: fails with `Unable to find an entity with index [ 5594 ]` in the same `handleSvcPacketEntities` UPDATE path.
- Best-supported model: `upstream_inherited_defect`
- Production fix: none included.
- Independent oracle gap: `demofile-net`, `source2-demo`, and `DemLockSharp` require additional isolated runtime/build/instrumentation work before they can resolve protocol behavior.

## Build 23916427 Bot And Normal Replay Comparison

- Gate: `new_replay_corpus_comparison_ready`
- New replay files found:
  - `replay_007`: `samples/replay_007_bots01.dem`, user metadata build 23916427, bots, one human, normal ending.
  - `replay_008`: `samples/replay_008_bots02_short.dem`, user metadata build 23916427, bots, one human, player quit.
  - `replay_009`: `samples/replay_009_normal.dem`, user metadata build 23916427, normal 12-human match, normal ending with pause.
- Default parser result:
  - `replay_007`: fails at tick 18 with missing entity `269035851` in `svc_PacketEntities`.
  - `replay_008`: fails at tick 3480 with missing entity `4436` in `svc_PacketEntities`.
  - `replay_009`: completes.
- Structural pass result: all three structurally traverse to EOF with no malformed command/message boundaries.
- Replay-006 exact signature search: entity 5594 loop-29 UPDATE pattern is absent/not reached in 007-009.
- Best-supported model: `solo_bot_mode_lifecycle_defect_supported`.
- Production fix: none included.
