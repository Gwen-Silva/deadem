# Task 165 - Materialized Expanded Death Validation Dry-Run Authorization

Status: completed

Gate: `materialized_expanded_death_validation_dry_run_authorization_ready`

Commit message: `Materialize expanded death validation dry-run authorization`

## Summary

Task 165 materialized the user-provided folder authorization into an explicit
manifest for a future expanded dry-run of `death_validation_compact_emission`.

The manifest authorizes future dry-run only:

- `expandedDryRunAuthorized: true`
- `realEmissionAuthorizedForExpansion: false`
- `eventCountNotFinalFact: true`

## Eligible Replays

The materialized dry-run pool contains 16 eligible replays:
replay_001, replay_002, replay_003, replay_004, replay_009, replay_010,
replay_011, replay_012, replay_013, replay_014, replay_015, replay_016,
replay_017, replay_018, replay_019, and replay_020.

If the operational target remains exactly 15 replays, a future task must
explicitly choose which eligible replay is excluded. Task 165 does not select an
exclusion.

## Blocked Replays

Replay_005 remains the protected final holdout. Replays 006-008 remain blocked
unsupported bot fixtures.

## Protection

No replay was accessed, opened, hashed, copied, inspected, parsed, or processed.
No runner was executed. No new real artifact, final fact, or gameplay
interpretation was emitted. Parser/engine behavior and `packages/deadem/**`
were not modified. Task 166 was not created.
