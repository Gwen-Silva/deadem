# Task 094: Finalize Replay 002 Terminal Validation

Status: completed

Gate: `replay_002_canonical_factual_state_ready_with_constraints_v9`

## Objective

Resolve the four frozen replay-002 terminal validation blockers without
regenerating the canonical factual layer.

## Result

- Terminal base-manifest verification now runs against the final closed set and
  excludes terminal artifacts explicitly.
- Evidence-only runs keep determinism as `not_evaluated` with `passed: null`;
  only the outer release run owns the A/B determinism decision.
- Release-envelope verification uses strict scope containment and rejects
  traversal outside the declared scope.
- IO dynamic-path findings use intraprocedural, order-aware guard tracking.

## Outputs

- `output/replay-002-canonical-v9-validation/terminal-base-manifest-verification.json`
- `output/replay-002-canonical-v9-validation/terminal-release-verification.json`
- `reports/replay-002-canonical-factual-state-v9-validation.md`

## Boundaries

No replay was processed. Replay 005 was not read, opened, copied, hashed, or
processed. Replays 006-008 were not processed. No canonical factual events,
snapshots, entity registry, or player registry were regenerated.

Task 095 remains blocked and was not executed.
