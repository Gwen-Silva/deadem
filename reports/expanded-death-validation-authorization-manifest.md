# Expanded Death Validation Authorization Manifest

Gate: `expanded_death_validation_authorization_manifest_ready`

Task 164 prepared an authorization package for a future expansion of
`death_validation_compact_emission`. It does not authorize new replay processing,
expanded dry-run, or real emission.

The manifest template keeps replay_010 and replay_011 only as already validated
seed evidence from Task 162. replay_010 had `eventCount: 45` and replay_011 had
`eventCount: 80`; these remain source-observed death counter transition
candidate counts only, not final death facts or gameplay truth.

## Required Future Authorization

A future task must provide replayId, localPath, mode, artifactClass, and a
task-specific authorization statement for every replay. It must explicitly state
that real emission is limited to `death_validation`, `eventCount` is not a final
death fact, replay_005 remains the protected holdout, replays 006-008 remain
blocked, and any candidate replay_012 through replay_020 is authorized one by
one.

Because Task 164 does not contain an authorized expanded replay list, the
selected next action is `await_explicit_replay_authorization`.

## Protections

No replay was accessed, opened, hashed, copied, inspected, parsed, or processed.
No new `death_validation.json`, final fact, source/canonical/match fact, or
gameplay interpretation artifact was emitted. Parser/engine behavior and
`packages/deadem/**` were not modified.
