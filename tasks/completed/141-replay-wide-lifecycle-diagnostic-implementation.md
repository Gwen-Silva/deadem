# Task 141 - Implement Replay-Wide Lifecycle Diagnostic Ledger

Status: completed

Gate: `replay_wide_lifecycle_diagnostic_implemented`

## Objective

Implement a compact replay-wide/local-parser lifecycle ledger for the existing `recovery.diagnoseMissingEntityFailClosed` mode using synthetic validation only.

## Result

`DemoMessageHandler` now records compact lifecycle/registry metadata in the existing diagnostic mode and includes a replay-wide/local-parser lifecycle summary plus diagnostic classification fields in the first `missing_entity_fail_closed` diagnostic.

Observed synthetic classifications:

- `not_determined` for insufficient local parser lifecycle history;
- `created_then_missing_registry_state_candidate` for prior CREATE/register evidence with missing registry state at the boundary;
- `removed_before_missing_update_candidate` for prior local DELETE/LEAVE-like parser operation before the missing update.

## Boundaries Preserved

No replay was processed. No `packages/deadem/**` files were modified. No new opt-in option was created. Default behavior remains unchanged. The diagnostic still throws fail-closed and does not recover, skip payload, create placeholders, create fake fields, create synthetic registry state, continue parsing after missing entity, apply the missing update, or emit canonical/source/match facts.

The classifications are diagnostic local-parser candidates only and do not claim Source 2 semantics, replay corruption, local parser correctness, in-game entity existence/nonexistence, or game destruction/delete/leave/remove semantics.
