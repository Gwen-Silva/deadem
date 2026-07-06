# Diagnostic Fail-Closed Missing Entity Review

Task 128 reviews the contract for a possible future diagnostic fail-closed mode for PacketEntities `missing entity` failures. It is a review only. It does not implement parser behavior and does not authorize implementation by itself.

## Definition

Diagnostic fail-closed means a future diagnostic-only mode could stop at the first observed missing-entity PacketEntities boundary, record compact approved metadata, and refuse to continue as if the UPDATE were valid.

It is distinct from:

- current fail-fast: current parser error path with minimal extra diagnostics;
- recovery: continuing by resolving or bypassing the failure;
- skip mode: skipping an entry or payload to continue later stream state;
- placeholder entity: creating synthetic entity state;
- parser fix: changing parser behavior or semantics.

Only the first two are compatible with this review. Recovery, skip mode, placeholder entities, and parser fixes remain out of scope.

## Evidence Policy

Allowed future diagnostic evidence would be compact metadata such as packet ordinal, loop, operation, entity index, index delta, read counts, payload bits, entityData bit length, registry state, already-known class metadata, and explicit booleans proving no fields, fake state, or canonical facts were produced.

Forbidden versioned evidence remains raw replay bytes, raw payloads, raw entityData, raw serializedEntities, string bytes, string values, field values, and full send-table payloads.

## Boundaries

A future diagnostic should stop before field extraction for the missing UPDATE, before any entity registration or placeholder behavior, and before any skip/continuation logic. Continuing after the boundary would move the task toward recovery or skip mode and would require separate authorization.

## Decision

Gate: `diagnostic_fail_closed_missing_entity_contract_ready`

This review preserves the separation between observed local parser evidence, hypotheses, inferences, and engineering decisions. It does not conclude Source 2 semantics, replay corruption, local parser correctness, recovery safety, or skip safety.

Any future implementation requires a new human-authored task with explicit scope and acceptance criteria.
