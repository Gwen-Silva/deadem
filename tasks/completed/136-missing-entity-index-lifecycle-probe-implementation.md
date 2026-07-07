# Task 136 - Implement Diagnostic Index Lifecycle Probe For Missing Entity

Status: completed

Gate: `missing_entity_index_lifecycle_probe_ready`

Implemented the approved `diagnostic_index_lifecycle_probe_only` extension on
top of the existing `recovery.diagnoseMissingEntityFailClosed` option.

Changes:
- `missing_entity_fail_closed` diagnostics now include compact packet-local
  lifecycle evidence.
- Diagnostics include `classificationCandidate`,
  `classificationConfidence`, `classificationBasis`, and `rawDataCaptured:
  false`.
- Classification remains conservative. Synthetic evidence with no prior
  same-entity lifecycle signal yields `not_determined`.
- The existing fail-closed behavior is preserved: the same missing entity
  error is thrown and parsing does not continue.

Boundaries preserved:
- No default behavior change.
- No new opt-in option.
- No recovery, skip mode, placeholder entity, fake fields, synthetic registry
  state, payload skip, update application, or parser continuation.
- No replay processing.
- No canonical/source/match/spatial/macro/mechanics/fight/decision/ML output.

Primary validation:
- `node --test tests/diagnostic-fail-closed-missing-entity.test.mjs`
