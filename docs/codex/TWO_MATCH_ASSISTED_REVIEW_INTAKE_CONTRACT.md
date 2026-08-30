# Two-Match Assisted Review Intake Contract

## Scope

Task 198 resolves exactly two independent review targets: `review_match_001` and `review_match_002`. Each target receives exactly one replay from its declared `replay` slot and one VOD from its declared `video` slot. Slot association is explicitly supplied by Gwen and no alternative matching is inferred.

## Provenance boundary

Local filename, path, size, streaming SHA-256, file signature/container and VOD duration are factual file observations. Match ID, replay build, match date, players, teams, heroes and result remain null or empty when safe bounded extraction is unavailable. Archmother/Hidden King labels, rosters and narrative context are preserved only as `human_supplied/player_reported`. Inferred metadata remains a separate empty namespace.

## Safety and storage

`review_match_001` and `review_match_002` are independent from historical replay IDs. The intake rejects paths containing `replay_005` through `replay_008` before file access. It does not map review targets to historical IDs, emit final facts or attribution, or interpret gameplay.

Replay and video binaries stay under ignored `.local/` storage. `.dem`, `.mp4`, `.mkv`, `.mov`, `.webm`, frames, thumbnails, contact sheets, caches and intermediates must never be versioned. Only compact manifests and audits are publishable.

## Gates

Four resolved inputs with complete secondary factual metadata yield `two_match_review_targets_ready`. Four resolved inputs with declared secondary metadata gaps yield the successful functional gate `two_match_review_targets_ready_with_declared_metadata_gaps`. Inaccessible host slots alone may yield `BLOCKED_BY_REVIEW_TARGET_FILES_NOT_MOUNTED`; missing or ambiguous slot contents fail closed without substituting historical inputs.
