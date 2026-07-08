# Post Batch Death Validation Expansion Decision

Gate: `post_batch_death_validation_expansion_decision_ready`

Task 162 proved controlled batch emission of compact schema-backed
`death_validation` artifacts for replay_010 and replay_011 only. replay_010
emitted `eventCount: 45`, and replay_011 emitted `eventCount: 80`; both had
`duplicateKeyCount: 0`. These values remain source-observed
`controller.m_iDeaths` counter transition candidate counts, not final death
facts, attribution, or gameplay truth.

Schema validation, output policy audit, and size audit passed in the mini-pilot.
No event rows, field values, player identity rows, killer/victim/assist
attribution, timelines, objective lifecycle, final source/canonical/match facts,
or gameplay interpretation were emitted.

## Decision

Selected next action: `prepare_expanded_death_validation_authorization_manifest`.

This is preferred over processing more replays immediately because Task 163 does
not authorize any replay processing, and a broader batch needs explicit
per-replay replayId/localPath authorization before either dry-run or real
emission. It is preferred over designing another compact source class because
`death_validation` is already schema-backed and proven in a two-replay
controlled mini-pilot.

## Expansion Requirements

A future expansion task must provide an explicit allowlist with replayId,
localPath, authorized mode, authorized artifact class, and a task-specific
authorization statement. It must state that replay_005 remains the protected
holdout, replays 006-008 remain blocked bot fixtures, and candidates 012-020 are
usable only if explicitly authorized one by one. Real emission must remain
limited to compact `death_validation` unless a separate class-specific task
authorizes another schema-backed artifact.

Processing 15 replays is not authorized yet.

## Protection Result

No replay was processed, opened, hashed, copied, inspected, or parsed in this
task. No new real artifact was emitted. Parser/engine behavior and
`packages/deadem/**` were not modified.
