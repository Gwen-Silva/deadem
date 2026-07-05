# Local Replay SerializedEntities Semantics Investigation

Gate: `local_replay_serialized_entities_semantics_investigated`

## Schema Facts

Field: `CSVCMsg_PacketEntities.serialized_entities` / `serializedEntities`
Field number: `13`
Schema type: `optional bytes`
Schema documents direct skip bits: `false`

## Extractor Contract

Algorithm: byte-oriented unsigned varint stream: each byte contributes 7 payload bits and high bit indicates continuation.
Direct after-command skip contract: `not_established`
Name status: `local_inference_not_schema_proof`

## Dynamic Evidence

Loop 21 mismatch: `true`
Loop 21 payloadBits/consumed: `227 / 363`
Loop 22 semantic status: `not_independently_justified`
Broader packet sample: `not_collected_requires_engine_instrumentation`

## Assessment

Direct skip assumption: `contradicted_by_observed_replay_metric_and_not_supported_by_schema`
Recommendation: `diagnostic_only_do_not_use_as_safe_skip`
Change parser now: `false`

## Protection

Replay 005 processed: `false`
Bot fixtures processed: `false`
Candidates 011-020 touched: `false`
Parser/engine modified: `false`
Canonical package constructed: `false`
Factual artifacts emitted: `false`

Summary output: `output/local-replay-processing/replay_010-serialized-entities-semantics-investigation/`

Task 111 was not created.
