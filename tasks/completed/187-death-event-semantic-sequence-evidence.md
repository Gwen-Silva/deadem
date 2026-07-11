# Task 187 - Repair Audit Integrity And Validate Death Semantic Sequences

Status: completed

Gate: `task186_audits_corrected_death_semantic_sequence_bounded32_ready`

## Result

- Restored Task 011 `commitSha` to null and assigned the exact Task 185 and 186
  SHAs only to their exact JSON task entries and history sections.
- Replaced substring commit checks with task-keyed JSON and section checks,
  including a regression that rejects the former Task 011 false positive.
- Recalculated Task 185 correction evidence from 32 unchanged artifacts and
  2,552 rows; 2,548 anchors have an exact inverse pair and 137 historical
  cycle-derived classes are affected.
- Enforced the integrity gate before replay-path resolution, `Player`
  construction, or parsing.
- Added atomic multi-replay publication testing that preserves prior successful
  content byte-for-byte on a failed run.
- Introduced `death_event_semantic_sequence_evidence_bounded32_task187` with
  exact Task 183 anchor and Task 186 matched-control bridges.

## Runs

The pilot processed replay_010, replay_011, replay_021, and replay_036. It
completed 4/4 parsers and emitted exactly 341 rows for 341 anchors and 341 exact
Task 186 controls.

The bounded-32 run processed only replay_001 through replay_004, replay_009,
and replay_010 through replay_036. It completed 32/32 parsers and emitted 2,552
rows for 2,552 anchors and 2,552 controls. Aggregate measurements were:

- coherent forward sequence rate: 0.944357;
- coherent uncensored recovery rate: 0.909016;
- matched-control coherent sequence rate: 0;
- anchor-minus-control sequence difference: 0.852273;
- stable pre-state coverage: 0.999216;
- post-transition persistence coverage: 0.953762;
- opposing directions: 24;
- ambiguity: 0;
- counter-before-recovery violations: 258;
- sequence bridge mismatches: 0;
- replay-end-censored anchors: 134.

The predeclared assessment is `partial`, so
`readyForOperationalDeathFactPromotionReview` is false. The technical gate may
pass with partial evidence and does not confirm deaths.

## Boundaries

Tasks 180, 182, 183, 184, 185, and 186 remain active. Task 187 adds a semantic
sequence evidence layer and rewrites no historical Task 185 or 186 artifact.
Replays 005-008 remained untouched. Final death facts, confirmed who-died,
attribution, killer/victim, teamfight detection, and gameplay interpretation
remain false.
