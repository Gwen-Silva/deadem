# Task 185 - Validate Directional Signal Cycles And Negative Controls For Death Semantics

Status: completed

Gate:
`task184_commit_recorded_directional_cycle_evidence_bounded32_ready`

Commit: 8ca6d50fd99fdc6fc4b802ab3af2e74b06f4796e

## Result

- Recorded the Task 184 commit
  `065d0fa0a1d422b3dcf342078100386e2ca7d793` in its completed task,
  contribution index, and project history.
- Clarified that Task 184 independence is observation separate from the Task
  183 anchor and distinct probe-family separation only, not statistical or
  causal independence and not proven Source 2 gameplay semantics.
- Documented historical `confirmationEvidenceLevel` as coverage strength only
  and used `corroborationCoverageLevel` for Task 185 references to Task 184.
- Added the `death_event_directional_cycle_evidence` schema, replay runner,
  tests, contract, consumption contract, pilot/bounded artifacts, and audits.
- Reproduced health-boundary, safely boolean-like alive,
  life-state-signature, respawn-boundary, and pawn-link transition classes
  directly from replay processing without persisting raw values or raw field
  names.
- Enforced one anchor association per source family, global transition reuse
  protection, equidistant ambiguity handling, later inverse-cycle matching,
  replay-end censoring, and replay-wide negative controls.

## Runs

The pilot processed only replay_010, replay_011, replay_021, and replay_036. It
parsed all four replays and emitted exactly 341 rows for 341 Task 183 anchors.
The pilot technical gate passed with zero mapping, bridge, reuse, schema,
policy, size, or replay-protection failures.

After the pilot passed, the bounded-32 run processed replay_001 through
replay_004, replay_009, and replay_010 through replay_036, including the
explicitly authorized replay_020. It parsed all 32 replays and emitted exactly
2,552 rows for 2,552 anchors with zero duplicate evidence keys, zero source
transition reuse, zero final facts, and zero attribution.

## Evidence Assessment

The bounded-32 measurements were:

- anchor alignment rate: 1.0;
- multiple-family anchor rate: 1.0;
- complete-cycle coverage rate: 1.0;
- uncensored complete-cycle coverage rate: 1.0;
- replay-end-censored anchors: 255;
- ambiguous anchors: 0;
- unanchored equivalent directional patterns: 3,218;
- unanchored equivalent complete cycles: 477;
- unmatched directional transitions: 7,766;
- unanchored equivalent-pattern rate: 0.24067.

The `directionalCycleCoverageLevel` is `partial`, not `strong`, because the
unanchored equivalent-pattern rate exceeds the predeclared strong limit of
0.05. Therefore `readyForFinalDeathSemanticContractDesign` remains false. The
technical baseline passes because low semantic coverage is not a parser,
mapping, protection, schema, policy, size, or reuse failure.

Task 186 correction note: Task 185 treated non-directional signature recurrence
as inversion for complete-cycle aggregation. Its historical complete-cycle
counts, family counts, coverage rates, and cycle-derived evidence classes
require corrected recalculation. The Task 185 gate remains a valid technical
observation-baseline gate; historical artifacts are preserved unchanged.

## Active Baselines

- `participant_identity_compact_bounded32_task180`
- `life_state_transition_candidates_bounded32_task182`
- `death_event_candidates_bounded32_task183`
- `death_event_corroboration_evidence_bounded32_task184`
- `death_event_directional_cycle_evidence_bounded32_task185`

Task 185 adds directional-cycle and negative-control evidence. It does not
supersede Tasks 180, 182, 183, or 184.

## Boundaries

Directional changes and inverse cycles remain abstract candidates. Task 185
does not confirm death, respawn, who died, killer, victim, assist, attribution,
teamfight, damage, objective relation, position, or gameplay interpretation.
Replay 005 remained untouched and replays 006-008 remained blocked.
