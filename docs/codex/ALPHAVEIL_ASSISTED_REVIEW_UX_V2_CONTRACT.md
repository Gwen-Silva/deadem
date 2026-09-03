# AlphaVeil Assisted Review Workspace UX V2 Contract

## Purpose

Task 215 presents the accepted four-target assisted-review data as a player-facing
workflow. It changes presentation and navigation only. Candidate, evidence,
review-state, export, transcript-correction, segment and playback semantics remain
the accepted contracts from Tasks 202–214.

## Product hierarchy

The default Review surface is organized into three responsibilities:

1. **Momentos** — chronological or suggested navigation through real prepared
   attention regions, with friendly `Momento N` labels, VOD time, real review
   state and existing safe thumbnails.
2. **Evidência** — one representative frame as the protagonist, selectable
   start/reference/end frames, an optional visual sequence and the available
   communication mode.
3. **Revisão** — unchanged human-authored fields grouped as Contexto, Decisão,
   Consequências, Avaliação and Aprendizado.

The visible method warning is normative: prepared moments direct human attention;
they are not automatically confirmed errors, events or conclusions.

## Stable data contract

- Targets remain exactly `review_match_001` through `review_match_004`.
- Candidate counts remain 67/35/48/57, totaling 207. The historical 001/002
  population remains 102.
- The eleven persisted review field keys remain unchanged and occur exactly once:
  `facts`, `unknownInformation`, `teamCall`, `playerIntent`, `observedAction`,
  `alternatives`, `immediateResult`, `longTermResult`, `decisionQuality`,
  `executionQuality`, and `reviewNotes`.
- The fifteen accepted error-class values remain unchanged. Visual chips are only
  a human input mechanism; no class is assigned automatically.
- Review states, transcript corrections, review segments and JSON/Markdown export
  remain the existing local-only representations.
- Segment timestamps are shown and accepted as `MM:SS` or `MM:SS.d`; persisted
  values remain seconds and are clamped to the candidate evidence interval only
  within the display rounding tolerance.

## Friendly navigation

Review URLs use `/review?match=NNN&moment=N`. History entries are written when a
user changes the match or moment, and browser Back/Forward restores the matching
real candidate. Unknown, malformed and protected values fail through the existing
allowlists. Internal candidate identifiers remain available only inside closed
advanced evidence details.

## Communication modes

- Review 003/004 exposes the accepted real synchronized Replay link with pre-roll
  and its nine-track mixer. It does not infer a call, speaker meaning or strategy.
- Review 001/002 exposes only existing audio segments and visibly labels the ASR
  text as an unvalidated automatic transcript. Human correction remains separate.
- The two modes never impersonate one another.

## Responsive behavior and accessibility

- Wide layout: simultaneous Momentos, Evidência and Revisão columns.
- Medium layout: Momentos and Evidência remain together; Revisão follows at full
  width.
- Narrow layout: Momentos becomes an off-canvas drawer while evidence and review
  stay in the document flow without horizontal overflow.
- Labels, focus behavior, status announcements, selected states, reduced motion
  and a real progressbar are retained for keyboard and assistive use.

## Privacy and safety

Screenshots, browser state, human canary entries, exported packets and media remain
under ignored local paths. No replay was opened or processed; no ASR ran; no media
is versioned. Replays 005–008 and protected package trees are outside this task.

## Explicit non-goals

This task does not change candidate ranking or selectivity, create gameplay facts,
infer decision quality, tune synchronization, redesign the Replay player, validate
ASR semantics, implement Patterns or Training, or authorize a follow-up task.
