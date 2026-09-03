# AlphaVeil Match Experience Contract

Task 214 presents accepted local review evidence as a player-facing product
experience. It does not change evidence, candidate, synchronization, review or
playback semantics.

## Public identity and routes

- `review_match_001` through `review_match_004` are displayed only as
  `Scrim 01` through `Scrim 04`.
- `/matches` lists exactly those four allowlisted matches.
- `/matches/001` through `/matches/004` are the only valid Overview routes.
- `/review?match=NNN&moment=N` resolves only an existing candidate belonging to
  the allowlisted match; invalid and protected values fail closed.

No date, opponent, result, lineup, map, competition or strategic importance is
inferred. Internal identifiers may exist in the local API but are not used as
the primary interface label.

## Product data derivation

- Review progress is computed from local human review state. `reviewed` and
  `skipped` both count as processed, while remaining distinct internally.
- A match is `not_started` with no processed or active moment, `in_progress`
  when some work exists and pending moments remain, and `completed` only when
  every moment is `reviewed` or `skipped`.
- Covers use the earliest deterministic representative frame already present
  in accepted visual evidence, fall back to another existing frame, and then
  to an AlphaVeil surface. A cover is not a highlight or importance claim.
- Gameplay means visual workspace evidence is available. Match data means the
  accepted candidate/workspace contains replay-observed factual evidence.
- Communication means legacy audio evidence for 001/002 or real multitrack
  context for 003/004. These mechanisms remain distinct internally.
- Synchronized Replay is shown only when a real resolvable Scrim Player session
  exists; currently that is 003/004.

## Presentation boundary

The product API may return safe opaque `/media/{id}` URLs. It must not return
filesystem paths, `.local` paths, replay/VOD/Craig paths or media extensions.
Moment cards remain bounded review-attention regions and are never described as
detected events, highlights, errors or important plays.

Home derives its Continue state from real local state and never claims recency
without a timestamp. Matches and Overview remain useful without media, state or
a synchronized session. Patterns and Training remain clearly labeled Preview.

## Security and preservation

The experience reads only accepted workspace manifests, review state and media
registries. It does not open `.dem` files, process replays, regenerate candidates
or evidence, run ASR, refit synchronization, or version local media. Targets
005–008 are rejected before resolution. Review and Replay keep their accepted
save, export, reopen, pre-roll, mixer and synchronization contracts.
