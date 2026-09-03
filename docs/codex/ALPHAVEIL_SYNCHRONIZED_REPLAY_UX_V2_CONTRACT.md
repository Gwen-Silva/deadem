# AlphaVeil Synchronized Replay UX V2 Contract

## Purpose

Task 216 presents the accepted real synchronized playback for Scrim 03 and
Scrim 04 as a player-facing AlphaVeil experience. It changes presentation,
public navigation and factual moment access only. Video-master transport,
Craig-to-VOD mapping, drift correction, mixer state and media authorization
remain the accepted Tasks 209–212 contracts.

## Public surface

- Public real Replay is limited to `003` and `004`.
- Match URLs are `/scrim?match=003` and `/scrim?match=004`.
- Moment URLs add a positive chronological ordinal, for example
  `/scrim?match=003&moment=25`.
- Review and Match Overview use those friendly routes. Existing technical
  `reviewTargetId`/VOD-time links remain accepted as a compatibility input, but
  internal target, session, candidate and track references are not displayed in
  the default product surface.
- Unknown, malformed and protected values are rejected before any media lookup.

## Moment timeline

The timeline contains exactly the prepared candidates already accepted for each
real target: 48 markers for Scrim 03 and 57 for Scrim 04. A marker is published
only when its existing `scrimContextEvidence` is available, belongs to the
selected target and has a finite anchor inside the validated VOD session range.
Missing or invalid context is omitted and declared as a gap; it is never clamped,
guessed or extrapolated.

Markers are ordered by their VOD anchor and expose only a friendly moment number,
time, real human-review state and Review link. They are structural review
attention regions, not gameplay events, deaths, errors, priority, relevance or
decision-quality claims.

Entering a moment URL keeps the accepted pre-roll so the reviewer receives
context. Clicking a marker or Previous/Next seeks to that marker's exact existing
anchor, preventing a second pre-roll from being applied.

## Video and communication

The real VOD remains the master clock and visual protagonist. The nine Craig
source tracks remain slaves of the accepted controller and retain mute, solo,
multi-solo, volume, isolation, automatic context restoration and VOD-audio
controls. The primary interface uses recording metadata display names and human
labels; raw track refs, mapping formulas and transport drift remain inside a
closed technical detail.

Track metadata does not establish biometric identity, team composition or the
meaning of speech. No transcript or ASR is required for playback.

## Responsive and accessible behavior

- Wide and standard desktop show the VOD and communication mixer together.
- Medium keeps both functional without horizontal overflow.
- Mobile stacks video, timeline, selected-moment context and all nine tracks.
- Markers have stateful accessible names, selected state and keyboard focus.
- Reduced-motion disables marker animation.

## Privacy and safety

Browser screenshots and canary state remain under ignored `.local/codex/216/`.
No replay was opened or processed, no ASR ran, no candidate/fact/sync artifact was
regenerated and no media is versioned. Replays 005–008, packages and all playback
motor files are outside this task.

## Explicit non-goals

This task does not calibrate synchronization, change playback behavior, rank or
interpret moments, infer gameplay facts, validate communication semantics,
implement Patterns or Training, or authorize Task 217.
