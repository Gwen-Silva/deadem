# PayloadBits Action Delta Contract Review

Gate: `payloadbits_action_delta_contract_reviewed`

Task 148 statically reviewed the local contract between `serializedEntities`
`payloadBits` and measured `entityData` action consumption. No replay was
processed and no parser or engine behavior changed.

## Conclusion

`payloadBits` and `afterAction - afterCommand` are conditionally comparable.
They are not established as a universal direct-equality contract.

The local code decodes `payloadBits` from
`CSVCMsg_PacketEntities.serializedEntities` with
`EntityPayloadSizeExtractor`. The action delta is measured from
`BitBuffer.getReadCount()` on `entityData` after the two command bits and after
the action path finishes. For normal UPDATE extraction, that action path can
include field-path reads plus field decoder reads.

## Replay 011 Loop 27

Task 147's compact output recorded loop 27 with `payloadBits: 221` and
`actionDelta: 373`, a difference of 152 bits. Read counts were monotonic,
within `entityData`, and the next entry started at the previous `afterAction`.

That mismatch is a real compact diagnostic signal, but it does not by itself
prove overconsumption, cursor misalignment, payload-size semantics, parser bug,
Source 2 semantics, or replay corruption. The boundary loop 28 itself is not a
valid payload comparison because the parser failed closed before applying the
missing UPDATE payload.

## Recommendation

Selected recommendation:
`treat_payloadbits_action_delta_comparison_as_conditional`.

The next safest evidence would be a future synthetic contract test plan for
payloadBits/actionDelta accounting. That future work must not use replay bytes,
recovery, skip, placeholders, or parser behavior changes unless separately
authorized.

## Protections

No replay was processed. No raw replay bytes, payloads, `entityData`,
`serializedEntities`, string bytes, string values, field values, full
send-table payloads, canonical facts, source artifacts, match facts, spatial,
macro, mechanics, fight, decision, or ML outputs were produced.
