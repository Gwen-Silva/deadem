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
