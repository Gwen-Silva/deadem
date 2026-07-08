# Upstream Char Decoder Fix

Gate: `upstream_char_decoder_fix_validated`

Task 149 adapted upstream commit `dba298dbed2b7978f9569e6e5e5c0bd787f36b4a` by resolving scalar `char` fields without `count` as `VAR_UINT_32_DECODER` instead of the registered string decoder.

## Replay Validation

- replay_010 old blocker resolved: `true`
- replay_010 first error after fix: `none`
- replay_011 old blocker resolved: `true`
- replay_011 first error after fix: `none`

## Classification

Final classification: `upstream_fix_resolved_replay_010_and_011`

This validation does not emit match facts, source artifacts, canonical output, raw payloads, raw entityData, raw serializedEntities, string values, field values, or full send-table payloads. It does not conclude Source 2 semantics, replay corruption, or total parser correctness.
