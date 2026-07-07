# Task 141 - Replay-Wide Lifecycle Diagnostic Ledger Implementation

Gate: `replay_wide_lifecycle_diagnostic_implemented`

Task 141 implemented the replay-wide/local-parser lifecycle ledger for the existing `recovery.diagnoseMissingEntityFailClosed` mode. The implementation is diagnostic-only and disabled by default.

No replay was processed. Validation was synthetic-only.

## Implementation

`DemoMessageHandler` now records compact local-parser lifecycle events while processing PacketEntities entries when the existing diagnostic opt-in is enabled. At the first missing entity boundary, the `missing_entity_fail_closed` diagnostic includes:

- compact lifecycle ledger summary;
- `diagnosticClassificationCandidate`;
- `diagnosticClassificationConfidence`;
- `diagnosticClassificationBasis`;
- `diagnosticClassificationLimitations`.

The parser still throws the same missing entity error and does not continue parsing, apply the missing update, skip payload, create placeholder/fake entities, create synthetic registry state, or materialize fields for the missing update.

## Synthetic Classifications

Synthetic tests cover:

- insufficient history -> `not_determined`;
- create/register observed before missing registry state -> `created_then_missing_registry_state_candidate`;
- prior local LEAVE/DELETE-like operation -> `removed_before_missing_update_candidate`.

All classifications are local parser diagnostic candidates only. They are not game facts, Source 2 semantics, replay corruption conclusions, or proof of local parser correctness.

## Protections

The implementation adds no new opt-in option, no recovery, no skip mode, no placeholder entity, no default behavior change, no canonical/source/match output, and no raw replay/payload/entityData/serializedEntities/string/field value output.
