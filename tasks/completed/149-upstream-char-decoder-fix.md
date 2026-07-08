# Task 149 - Apply Upstream Char Field Decoder Fix

Status: completed

Gate: `upstream_char_decoder_fix_validated`

Commit message: `Apply upstream char field decoder fix`

Applied the upstream semantic fix from `dba298dbed2b7978f9569e6e5e5c0bd787f36b4a`: scalar `char` fields without `count` now resolve through `VAR_UINT_32_DECODER` instead of the registered string decoder. The local adaptation passes full `FieldDefinition` objects into decoder resolution, applies the scalar-char special case before name overrides/type registry to match upstream precedence, keeps counted `char[N]` on the registered string decoder, and applies the same scalar child resolution to variable-array generics.

## Validation

- Synthetic decoder coverage was added in `tests/fieldfactory-char-decoder.test.mjs`.
- Post-fix replay validation was run only for authorized `replay_010` and `replay_011`. Both reached end in default mode; the previous missing-entity blockers 2905 and 5624 were resolved.
- Validation outputs are under `output/local-replay-processing/upstream-char-decoder-fix/`.

## Scope Controls

No recovery, skip mode, placeholder entity, synthetic registry state, new opt-in option, parser continuation after missing entity, canonical facts, source artifacts, match facts, raw replay bytes, raw payloads, raw entityData, raw serializedEntities, string values, field values, or full send-table payloads were produced. Replay 005, replays 006-008, candidates 012-020, samples/**, and output/replays/** were not processed.

## Final Classification

`upstream_fix_resolved_replay_010_and_011`
