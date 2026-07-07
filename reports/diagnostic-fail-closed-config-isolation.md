# Diagnostic Fail-Closed Config Isolation

Task 130 hardened `recovery.diagnoseMissingEntityFailClosed` by rejecting
configuration combinations that could undermine the diagnostic fail-closed
contract.

Gate: `diagnostic_fail_closed_config_isolation_ready`

## Decision

When `recovery.diagnoseMissingEntityFailClosed === true`,
`ParserConfiguration` now rejects:

- `recovery.allowUnresolvedEntityReference`
- `recovery.allowMissingClassBaseline`
- `recovery.allowEntityPacketBoundaryTruncation`

`allowUnresolvedEntityReference` is rejected because it is the existing
missing-entity recovery path. `allowMissingClassBaseline` is rejected to keep
the diagnostic isolated from recovery-oriented configuration. Boundary
truncation is rejected because it is a continuation-oriented structural mode,
while this diagnostic contract stops at the missing-entity boundary.

No handler precedence change was needed because invalid combinations now fail
during configuration construction.

## Validation

The synthetic unit test suite confirms:

- default behavior remains `recovery: null`;
- the diagnostic option remains valid when used alone;
- incompatible recovery/truncation options are rejected;
- the Task 129 isolated opt-in diagnostic still records compact metadata and
  throws without recovery or continuation;
- no replay was processed.

No Source 2 semantics, replay corruption, or local parser correctness claim is
made.
