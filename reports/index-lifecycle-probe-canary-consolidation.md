# Task 139 - Index Lifecycle Probe Canary Consolidation

Gate: `index_lifecycle_probe_canaries_consolidated`

Task 139 consolidated the committed compact outputs from Tasks 137 and 138. It did not process replay files, execute external parsers, modify parser/engine code, or create recovery, skip mode, placeholder behavior, parser fixes, canonical facts, source artifacts, or match outputs.

## Boundary Comparison

Both canaries reached the existing `missing_entity_fail_closed` boundary and still threw fail-closed:

- replay_010: packet 954 loop 33, UPDATE entity 2905, previous entity index 2717, indexDelta 187, payloadBits 193, entityDataBitLength 5936.
- replay_011: packet 1052 loop 28, UPDATE entity 5624, previous entity index 2681, indexDelta 2942, payloadBits 133, entityDataBitLength 5848.

Both diagnostics recorded registry state as `missing` before and after, read counts within entityData, and no continuation, recovery, skip, placeholder, canonical output, or raw data capture.

## Classification

Both classifications remain `not_determined` with confidence `not_applicable`. The shared basis is that packet-local cursor metadata cannot establish replay-wide lifecycle, create/register/removal provenance, or index-stream cause.

Observed facts were separated from hypotheses, weak inferences, indetermined questions, and forbidden claims in `evidence-classification.json`. The consolidation does not claim Source 2 semantics, replay corruption, local parser correctness, that either entity never existed in-game, or that registry absence proves deletion/removal/destruction.

## Decision

The selected next action is:

`prepare_replay_wide_lifecycle_diagnostic_spec_for_human_approval`

This is a future spec-only route. It is preferred because repeating packet-local probes is unlikely to reduce the current uncertainty, while a bounded replay-wide lifecycle diagnostic spec can define what evidence would be required before any later implementation decision. It does not authorize implementation, replay processing, recovery, skip mode, placeholders, default behavior changes, or canonical/factual output.
