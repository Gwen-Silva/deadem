# Diagnostic Fail-Closed Replay 011 Canary

Task 132 ran the authorized replay_011-only canary for
`recovery.diagnoseMissingEntityFailClosed`.

Gate: `diagnostic_fail_closed_replay_011_canary_ready`

## Result

The default pass still fails with:

`Unable to find an entity with index [ 5624 ]`

The diagnostic pass used only:

```js
recovery: {
  diagnoseMissingEntityFailClosed: true
}
```

It also throws the same missing-entity error, while recording one compact
`missing_entity_fail_closed` diagnostic.

Captured boundary:

- packet ordinal: 1052
- loop: 28
- updated entries: 34
- operation: UPDATE
- entity index: 5624
- previous entity index: 2681
- index delta: 2942
- payload bits: 133
- entityData bit length: 5848

The diagnostic confirms no recovery, skip mode, payload skip, update
application, placeholder/fake entity, synthetic registry state, field
materialization, parser continuation, canonical facts, source artifacts, match
facts, or interpretation-layer outputs were produced.

Only `replay_011` was processed. No other replay was accessed or processed.
