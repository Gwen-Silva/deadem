# Task 164 - Expanded Death Validation Authorization Manifest

Status: completed

Gate: `expanded_death_validation_authorization_manifest_ready`

Commit message: `Prepare expanded death validation authorization manifest`

## Summary

Task 164 prepared a no-replay authorization package for a future expansion of
`death_validation_compact_emission`.

The package includes:

- an expanded authorization manifest template;
- a future authorization request;
- replay eligibility policy;
- protected replay policy;
- expansion preflight requirements;
- rejected actions;
- protection audit.

## Decision

Selected next action:
`await_explicit_replay_authorization`.

No expanded replay list was authorized in this task. replay_010 and replay_011
are retained only as already validated seed evidence from Task 162, not as
automatic authorization for reprocessing. Candidates replay_012 through
replay_020 remain `pending_user_authorization` and require one-by-one future
authorization with replayId and localPath.

## Limits

`eventCount` remains a source-observed counter transition candidate count, not a
final death fact. No replay was opened, hashed, copied, inspected, parsed, or
processed. No new real artifact, final fact, or gameplay interpretation was
emitted. Replay 005 remains the protected holdout, and replays 006-008 remain
blocked unsupported bot fixtures. Parser/engine behavior and `packages/deadem/**`
were not modified. Task 165 was not created.
