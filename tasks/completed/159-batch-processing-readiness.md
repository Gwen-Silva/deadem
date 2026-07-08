# Task 159 - Batch Processing Readiness

Status: completed

Gate: `batch_processing_readiness_designed`

Commit message: `Design compact batch replay processing readiness`

## Summary

Task 159 designed a compact batch replay processing policy after Task 158. It
did not process any replay and did not emit real source/canonical/match facts.

## Key Decisions

- Every batch requires an explicit allowlist.
- Replays outside the allowlist are blocked before filesystem access.
- replay_005 remains protected as final holdout.
- replays 006-008 remain blocked as unsupported bot fixtures.
- candidates 012-020 remain blocked unless separately authorized.
- Batch modes are `parse_only`, `dry_run_readiness`,
  `death_validation_compact_emission`, and `blocked`.
- Partial failures must be isolated and reported; silent partial emission is not
  allowed.
- Real batch `death_validation` emission requires pre/post policy audit, schema
  validation, and size audit.

## Recommendation

Selected Task 160 recommendation:
`implement_batch_dry_run_runner`.

This is safer than immediate batch emission because it validates allowlist
enforcement, protected replay blocking, batch manifests, per-replay status,
failure isolation, output policy readiness, and size summaries without writing
real source content.

## Protections

No replay was processed. replay_010, replay_011, replay 005, replays 006-008,
candidates 012-020, `samples/**`, and `output/replays/**` were not accessed or
processed. Parser/engine behavior and `packages/deadem/**` were not modified.
No batch runner, parser fix, recovery, skip, placeholder, default behavior
change, new opt-in, real `death_validation`, `death_events`, `respawn_events`,
source/canonical/match final facts, gameplay interpretation output, Java,
Clarity, external parser, WSL, iaflow, Product Reviewer automation, pull, merge,
cherry-pick, rebase, or Task 160 was produced.
