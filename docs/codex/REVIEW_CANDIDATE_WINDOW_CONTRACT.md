# Review Candidate Window Contract

## Purpose

Task 202 reduces the two accepted synchronized replay timelines to bounded
`review_attention_region` candidates. A window requests later visual evidence;
it is not a fight, death, gank, pickoff, rotation, objective contest, bad play
or decision error.

## Inputs and access boundary

The generator reads only:

- Task 199 committed manifest/availability plus its hash-validated local JSONL;
- Task 200 accepted covered replay-to-VOD mapping;
- Task 201 committed frame and contact-sheet indexes.

It does not open replay, VOD or frame bytes. Every Task 199 local artifact is
checked against its committed size and SHA-256 before any signal is consumed.
Replays 005-008 remain rejected before filesystem access.

## Signal bins and seeds

Replay observations are accumulated in deterministic five-second bins. A bin
is only a time container and never a gameplay event.

- lifecycle: actual changes in `lifeState`, `alive`, `deaths` or
  `respawnState`; ordinary health changes are excluded;
- damage/healing: positive Task 199 aggregate counter deltas, without
  source-target attribution;
- economy: participant net-worth counter changes, reporting signed and
  absolute aggregate changes without advantage semantics;
- objective-like: health changes observed for the same raw `entityRef`, without
  destruction, contest, completion or reward semantics.

Every lifecycle and objective-like change becomes a high-recall seed. Damage,
healing and economy bins become seeds at the deterministic per-match nearest-
rank 75th percentile among covered non-zero bins. Human narrative without an
explicit timestamp creates no seed. Task 197 has no direct review-target bridge
and is recorded as `task197_signal_unavailable_for_review_targets`.

## Window policy

Seeds at most 15 seconds apart are grouped. Each group receives 12 seconds of
padding on each side, clipped to Task 200 coverage. Greedy deterministic splits
keep every window at or below 90 seconds, and every mapped seed appears exactly
once. Unmapped seeds are counted and remain
`unreviewable_by_current_sync`; they are never extrapolated.

Priority is a review heuristic based only on independent family count:

- high: at least three families;
- medium: two families;
- low: one family.

Every artifact declares `notProbability: true`. No numeric probability is
produced or optimized.

## Video and visual navigation

Task 200 mapping is consumed without refit. Candidate replay bounds map to VOD
bounds, while the recommended visual evidence range expands by the accepted
sync error and clamps to the mapping segment. Candidate replay range and
expanded visual range remain distinct.

Each window links Task 201's nearest coarse frame before, frames inside, nearest
frame after and relevant contact sheets. These are local navigation references;
their image content is not read or interpreted.

## Volume and gates

`candidateCoverageFraction` is the union of candidate replay windows divided by
accepted synchronized replay duration. Coverage above 80 percent in either
target or in aggregate yields
`two_match_review_candidate_windows_ready_with_low_selectivity`. Functional
coverage below that warning yields `two_match_review_candidate_windows_ready`.
Missing important families with usable windows yields the partial gate. Missing
or corrupt required Task 199 local artifacts yields
`BLOCKED_BY_REVIEW_TELEMETRY_ARTIFACTS_UNAVAILABLE` without reopening the
parser.

Detailed bins and seeds remain ignored under
`.local/deadem/review-candidates/`. Only seven bounded metadata artifacts are
versioned. Final facts, attribution and gameplay interpretation remain zero.
