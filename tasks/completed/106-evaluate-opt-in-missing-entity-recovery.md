# Task 106: Evaluate Opt-In Missing Entity Recovery For Local Replay Canary

Status: completed

Gate: `local_replay_missing_entity_recovery_partial_progress`

Commit: not recorded in task file

## Objective

Evaluate whether bounded opt-in parser recovery can move the authorized
`replay_010` local canary beyond the Task 105 missing entity failure without
changing default behavior, fabricating entity state, or producing canonical
facts.

## Result

Default parser behavior remained unchanged and reproduced the Task 105 failure:
`Unable to find an entity with index [ 2905 ]` after 953 ticks.

Opt-in recovery for unresolved entity references advanced past that blocker to
tick 2862, then stopped on a later `entity index out of range` parser boundary.
This is useful partial progress, not a complete local replay processing path.

## Recovery Scope

- Recovery is disabled by default.
- Recovery must be explicitly configured.
- Recovery requires single-thread parser mode.
- Missing entity `UPDATE` payloads are skipped only when a bounded payload size
  is available.
- Missing entity `LEAVE` and `DELETE` transitions are ignored only in opt-in
  recovery mode.
- Recovery records warnings instead of creating placeholder entities.
- No fake entities or materialized fields were created.

## Outputs

- `output/local-replay-processing/replay_010-missing-entity-recovery/recovery-feasibility-inventory.json`
- `output/local-replay-processing/replay_010-missing-entity-recovery/input-identity.json`
- `output/local-replay-processing/replay_010-missing-entity-recovery/default-pass-result.json`
- `output/local-replay-processing/replay_010-missing-entity-recovery/recovery-pass-result.json`
- `output/local-replay-processing/replay_010-missing-entity-recovery/recovery-warning-summary.json`
- `output/local-replay-processing/replay_010-missing-entity-recovery/protection-audit.json`
- `output/local-replay-processing/replay_010-missing-entity-recovery/replay-specific-branch-audit.json`
- `output/local-replay-processing/replay_010-missing-entity-recovery/recovery-gate.json`
- `reports/local-replay-missing-entity-recovery-canary.md`

The full warning log remains local-only under
`.local/deadem/cache/local-replay-processing/replay_010/missing-entity-recovery/`
with hash metadata in the committed warning summary.

## Protections

- Replay 005 was not read, opened, copied, hashed, or processed.
- Replays 006-008 were not processed.
- Candidates 011-020 were rejected by input validation.
- No `samples/` path was used.
- No replay bytes, canonical package, factual events, snapshots, registries,
  spatial fields, mechanic effects, or strategic interpretations were emitted.
- Task 107 was not created.

## Validation

- Focused missing-entity recovery tests passed.
- The authorized replay_010 canary was executed in default and opt-in recovery
  modes.
- JSON outputs were generated with compact committed summaries.
- Task queue, lint, output-size, Codex validation, and review checks were run as
  part of the handoff.
