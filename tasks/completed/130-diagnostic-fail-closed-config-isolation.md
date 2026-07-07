# Task 130 - Harden Missing Entity Diagnostic Configuration Isolation

Status: completed

Gate: `diagnostic_fail_closed_config_isolation_ready`

Task 130 hardened the Task 129 diagnostic fail-closed configuration boundary.
`ParserConfiguration` now rejects `recovery.diagnoseMissingEntityFailClosed`
when it is combined with options that could undermine the missing-entity
fail-closed contract.

Rejected combinations:

- `recovery.diagnoseMissingEntityFailClosed` with
  `recovery.allowUnresolvedEntityReference`
- `recovery.diagnoseMissingEntityFailClosed` with
  `recovery.allowMissingClassBaseline`
- `recovery.diagnoseMissingEntityFailClosed` with
  `recovery.allowEntityPacketBoundaryTruncation`

The implementation is configuration validation only. It does not add recovery,
skip mode, placeholder entities, fake fields, synthetic registry state,
continuation after missing entity, parser default behavior changes, canonical
facts, source artifacts, match facts, or semantic claims.

Validation used synthetic/unit tests only. No replay was processed.

Artifacts:

- `output/local-replay-processing/diagnostic-fail-closed-config-isolation/config-isolation-decision.json`
- `output/local-replay-processing/diagnostic-fail-closed-config-isolation/default-behavior-preservation.json`
- `output/local-replay-processing/diagnostic-fail-closed-config-isolation/incompatible-options-test-result.json`
- `output/local-replay-processing/diagnostic-fail-closed-config-isolation/protection-audit.json`
- `output/local-replay-processing/diagnostic-fail-closed-config-isolation/isolation-gate.json`
- `reports/diagnostic-fail-closed-config-isolation.md`
