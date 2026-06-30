# Task 055: Investigate Generic Bot Solo Lifecycle Comparison

Status: blocked
Execution mode: autonomous
Project stage: parser compatibility
Depends on: task 054 completed
Unlocked by: explicit user authorization or a documented parser-priority decision

## Blocker

Task 054 showed that build 23916427 bot replays 007 and 008 fail in `svc_PacketEntities` missing-entity paths while build 23916427 normal replay 009 completes. The exact replay-006 loop-29/entity-5594 signature did not recur. A follow-up should be scheduled only if bot/solo replay support remains a project priority.

## Objective

Compare bot/solo replay packet-entity lifecycle behavior against normal human replay behavior and determine whether a generic bot/solo initialization, state-refresh, or entity lifecycle path is unsupported by the parser.

## Constraints

- Do not process replay 005.
- Do not add ID-specific missing-entity, baseline, or class recovery.
- Do not fabricate entity state.
- Do not execute task 053 as part of this task.
- Keep full traces local and untracked.

## Required scope

- Use replay 007 and replay 008 as bot/solo failing cases.
- Use replay 009 as same-build normal human control.
- Use replay 006 only as a prior bot-match anomaly reference, preserving its unknown-build confounder.

## Gate

Produce exactly one:

- `bot_solo_lifecycle_root_cause_confirmed`
- `bot_solo_lifecycle_narrowed_not_confirmed`
- `bot_solo_lifecycle_not_project_priority`
- `bot_solo_lifecycle_blocked`
