# Structural Replay Stream Pass

Date: 2026-06-29

## Scope

Task 047 implemented and ran a structural replay-envelope pass for eligible replays 001, 002, 003, 004, and 006. Replay 005 was excluded and not inspected. The pass reads headers, top-level command envelopes, packet/message envelopes, sizes, offsets, and malformed boundaries without materializing gameplay state.

## Replay 005 Protection

- Excluded: true
- Processed: false
- Content inspected: false

## Cross-Replay Results

| Replay | Commands | Messages | Final tick | Byte coverage | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| replay_001 | 191537 | 4152408 | 191431 | 100% | completed_to_eof |
| replay_002 | 117516 | 2422602 | 117423 | 100% | completed_to_eof |
| replay_003 | 146010 | 3130096 | 145912 | 100% | completed_to_eof |
| replay_004 | 128869 | 2961797 | 128775 | 100% | completed_to_eof |
| replay_006 | 59702 | 950528 | 59600 | 100% | completed_to_eof |

## Replay 006 Boundary

- Tick 3808 command framing valid: true
- Packet payload length internally consistent: true
- Embedded message boundaries valid: true
- Bytes after the entity-5594 message structurally enumerable: true
- Later ticks structurally reachable: true
- Baseline 709 and class 891 failures semantic/state-only under this evidence: true

## Determinism

Replay 006 structural rerun passed: true

## Interpretation

`replay_006_state_reconstruction_failure`

This separates replay container/framing readability from gameplay-state reconstruction. Structural readability does not validate entities, baselines, classes, player positions, events, or semantic telemetry.

## Validation

- All eligible headers parsed: true
- All eligible structurally complete: true
- Malformed commands: 0
- Malformed messages: 0
- Deterministic replay 006: true

## Gate

`structural_replay_pass_ready`
