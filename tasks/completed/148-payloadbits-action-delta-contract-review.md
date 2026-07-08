# Task 148 - PayloadBits Action Delta Contract Review

Status: completed

Gate: `payloadbits_action_delta_contract_reviewed`

Commit message: `Review payloadBits action delta contract`

## Summary

Reviewed the static local contract between `serializedEntities` payload sizes
and measured `entityData` action consumption around the Task 147 replay_011
probe evidence.

The review found that `payloadBits` and `afterAction - afterCommand` are
conditionally comparable, not a universal direct-equality contract. `payloadBits`
is decoded from `serializedEntities`; `actionDelta` is measured on `entityData`
and can include field-path and field-decoder reads by `EntityMutationExtractor`.

Task 147 loop 27 remains a compact mismatch signal:

- payloadBits: 221
- actionDelta: 373
- difference: 152
- read counts monotonic: true
- read counts within entityData: true

This does not prove parser bug, Source 2 semantics, replay corruption, local
parser correctness, or recovery/skip safety.

Selected recommendation:
`treat_payloadbits_action_delta_comparison_as_conditional`.

No replay was processed. No parser/engine behavior changed. No recovery, skip
mode, placeholder entity, fake fields, synthetic registry state, continuation
after missing entity, parser fix, default behavior change, new opt-in,
canonical/source/match output, raw replay bytes, raw payloads, raw entityData,
raw serializedEntities, string bytes, string values, field values, or full
send-table payload was produced.
