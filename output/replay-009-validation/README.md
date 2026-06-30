# Replay 009 Validation Outputs

This directory contains compact Task 056 telemetry validation artifacts for `samples/replay_009_normal.dem`.

- Gate: `replay_009_telemetry_usable_with_known_gaps`
- Replay 005: excluded.
- Unsupported bot fixtures 006-008: excluded.
- Primary limitation: explicit_pause_interval_not_exposed.
- Pause/clock follow-up: Task 057 produced `replay_009_pause_clock_not_exposed`; parser seconds remain the canonical available time basis.

These outputs validate factual telemetry quality only. They do not infer strategy, rotations, semantic lane occupancy, fight quality, or player skill.
