# Batch Processing Readiness

Gate: `batch_processing_readiness_designed`

Task 159 designed the compact batch replay processing policy. No replay was
processed and no real source/canonical/match artifact was emitted.

## Policy

Every batch must use an explicit allowlist. Replays outside that allowlist are
blocked before filesystem access. replay_005 remains the final protected
holdout; replays 006-008 remain unsupported bot fixtures; candidates 012-020
remain blocked unless a separate task explicitly authorizes them.

The defined modes are:

- `parse_only`
- `dry_run_readiness`
- `death_validation_compact_emission`
- `blocked`

The first batch milestone should implement `dry_run_readiness`, not real
emission. That gives us allowlist enforcement, protected replay audit, per-replay
status, failure isolation, schema readiness, policy readiness, and size summary
before emitting any new batch artifacts.

## Recommendation

Selected Task 160 recommendation:
`implement_batch_dry_run_runner`.

The project should reach a passing dry-run mini-pilot before authorizing
`death_validation_compact_emission` in batch mode. Expansion toward 15 replays
requires explicit per-replay authorization, dry-run success, protected replay
audit, schema/policy/size validation, and no gameplay interpretation output.
