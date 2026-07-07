# Task 136 - Missing Entity Index Lifecycle Probe Implementation

Gate: `missing_entity_index_lifecycle_probe_ready`

Task 136 implemented the approved `diagnostic_index_lifecycle_probe_only`
intervention as an extension of the existing
`recovery.diagnoseMissingEntityFailClosed` mode. No new opt-in option was
added and default behavior remains unchanged.

The diagnostic now records compact packet-local lifecycle metadata:
`lifecycleEvidenceSummary`, `classificationCandidate`,
`classificationConfidence`, `classificationBasis`, and `rawDataCaptured:
false`. The synthetic coverage exercises the existing fail-closed path and
observes `classificationCandidate: not_determined`, because packet-local
cursor metadata is not enough to establish replay-wide lifecycle or
index-stream cause.

The implementation does not recover, skip payloads, create placeholders,
materialize fake fields, synthesize registry state, continue after the
missing entity, or emit canonical/source/match outputs. It also does not claim
Source 2 semantics, replay corruption, or parser correctness.

Validation was synthetic-only. No replay was processed.
