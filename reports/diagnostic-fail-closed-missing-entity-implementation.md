# Diagnostic Fail-Closed Missing Entity Implementation

Task 129 implements a minimal disabled-by-default diagnostic for PacketEntities missing-entity failures.

The new option is `recovery.diagnoseMissingEntityFailClosed`. It is `false` unless explicitly enabled. When enabled, the existing missing-entity fail-fast path records compact metadata before throwing the same class of error. It does not continue parsing, skip payload, create placeholder entities, materialize fields, create fake registry state, or produce canonical facts.

Replay_010 was not processed. The behavior was validated with a synthetic unit fixture that contains no replay bytes.

## Default Behavior

Default parser configuration still has `recovery: null`. A synthetic UPDATE to a missing entity still throws `Unable to find an entity with index [ 0 ]` and records no diagnostic.

## Diagnostic Behavior

With `recovery.diagnoseMissingEntityFailClosed: true`, the same synthetic missing UPDATE records one `missing_entity_fail_closed` diagnostic and still throws. The diagnostic contains only compact metadata: packet ordinal, loop, operation, entity index, index delta, read counts, entityData bit length, registry state, compact error class/message, and booleans proving no continuation or synthetic state.

## Non-Claims

This implementation does not conclude Source 2 semantics, replay corruption, local parser correctness, recovery safety, or skip safety. It is diagnostic only and disabled by default.

Gate: `diagnostic_fail_closed_missing_entity_implemented`.
