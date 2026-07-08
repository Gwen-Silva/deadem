# Materialized Expanded Death Validation Dry-Run Authorization

Gate: `materialized_expanded_death_validation_dry_run_authorization_ready`

Task 165 materialized the user-provided folder authorization into an explicit
future dry-run manifest for `death_validation_compact_emission`. The manifest
authorizes expanded dry-run only. It does not authorize real emission.

Eligible for future dry-run: 16 replays:
replay_001, replay_002, replay_003, replay_004, replay_009, replay_010,
replay_011, and replay_012 through replay_020.

Blocked replays remain:

- replay_005: protected final holdout
- replay_006: unsupported bot fixture
- replay_007: unsupported bot fixture
- replay_008: unsupported bot fixture

If the operational target remains exactly 15 replays, a future task must choose
which one of the 16 eligible replays is excluded. Task 165 does not make that
selection automatically.

Recommended next action: `run_expanded_death_validation_dry_run`.

No replay was accessed, opened, hashed, copied, inspected, parsed, or processed.
No runner was executed. No new `death_validation.json`, real artifact, final
fact, or gameplay interpretation was emitted.
