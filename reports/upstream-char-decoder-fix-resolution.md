# Upstream Char Decoder Fix Resolution

Gate: `upstream_char_decoder_fix_resolution_consolidated`

## Symptom

The old local parser blocker was the repeated `missing_entity_fail_closed` class in two authorized human canaries:

- replay_010: `Unable to find an entity with index [ 2905 ]` at packet 954 loop 33
- replay_011: `Unable to find an entity with index [ 5624 ]` at packet 1052 loop 28

## Applied Fix

Task 149 adapted upstream commit `dba298dbed2b7978f9569e6e5e5c0bd787f36b4a`: scalar `char` fields without `count` resolve as `VAR_UINT_32_DECODER`, not as null-terminated strings. Counted `char[N]` fields remain on the registered string decoder.

## Interpretation

The probable cause of the old missing-entity boundaries was field extraction overconsumption and cursor desynchronization caused by decoding scalar `char` as string. The earlier payloadBits/actionDelta mismatch is now best treated as a symptom compatible with the wrong decoder, not as an isolated final cause. Cursor/index and command decode hypotheses are weakened for these old boundaries because replay_010 and replay_011 passed after the decoder fix without cursor/index behavior changes.

## Validation Reused

Task 149 default validation reached end for both replay_010 and replay_011. Task 150 did not process any replay.

## Still Prohibited

This consolidation does not prove total parser correctness, Source 2 semantics, replay corruption or non-corruption, game facts, recovery safety, skip safety, placeholder safety, or canonical/source/match correctness.

## Next Milestone

Recommended next milestone: `resume_generic_local_replay_pipeline_validation_post_parser_fix`. Resume from the previously blocked generic local replay processing/canonicalization path with a separately scoped task and explicit replay authorization. Do not continue the old multi-hypothesis missing-entity route for the resolved boundaries.
