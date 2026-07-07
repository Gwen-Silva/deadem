# Diagnostic Fail-Closed Replay 010 Canary

Task 131 ran the authorized replay_010-only canary for
`recovery.diagnoseMissingEntityFailClosed`.

Gate: `diagnostic_fail_closed_replay_010_canary_ready`

## Result

The default pass still fails with:

`Unable to find an entity with index [ 2905 ]`

The diagnostic pass used only:

```js
recovery: {
  diagnoseMissingEntityFailClosed: true
}
```

It also throws the same missing-entity error, while recording one compact
`missing_entity_fail_closed` diagnostic.

Captured boundary:

- packet ordinal: 954
- loop: 33
- updated entries: 34
- operation: UPDATE
- entity index: 2905
- previous entity index: 2717
- index delta: 187
- payload bits: 193
- entityData bit length: 5936

The diagnostic confirms no recovery, skip mode, payload skip, update
application, placeholder/fake entity, synthetic registry state, field
materialization, parser continuation, canonical facts, source artifacts, match
facts, or interpretation-layer outputs were produced.

Only `replay_010` was processed. No other replay was accessed or processed.
