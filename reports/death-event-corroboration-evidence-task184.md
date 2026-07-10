# Death Event Corroboration Evidence - Task 184

## Outcome

Gate:
`task183_validation_corrected_death_event_corroboration_evidence_bounded32_ready`.

This gate means the unconfirmed corroboration-evidence baseline is reproducible
and consumable. It does not mean that any death is confirmed.

## Task 183 Validation Repair

- Runtime: Ajv Draft 2020-12.
- Pilot validation: passed, 341 candidate rows.
- Bounded-32 validation: passed, 2,552 candidate rows.
- Candidate-row equivalence: passed; validation repair changed zero rows.
- Bounded-32 refs: 2,552 participant, hero, team, and normalized-time refs.
- Unmapped: 0; final facts: 0; attribution: 0.
- Size enforcement: 512 KiB per artifact and 16 MiB total run, both gate inputs.
- Replay files opened for Task 183 repair: none.

## Pilot

The pilot parsed replay_010, replay_011, replay_021, and replay_036 to completion.
It preserved exactly 341 Task 183 anchors and emitted exactly 341 Task 184 rows.
Schema, output policy, size, protection, mapping, bridge, temporal, ambiguity,
and independence audits passed.

## Bounded-32 Result

- Replays parsed: 32/32.
- Task 183 anchors: 2,552.
- Task 184 evidence rows: 2,552.
- Counter-only rows: 0.
- Rows with one independent signal: 0.
- Rows with multiple independent signal candidates: 2,552.
- Ambiguous rows: 0.
- Anchors without uniquely associated signal candidates: 0.
- Unmatched signal changes: 15,943.
- Participant mapping failures: 0.
- Parser failures: 0.
- Duplicate evidence keys: 0.
- Final facts: 0; attribution: 0.
- Evidence assessment: `strong`.

The historical `confirmationEvidenceLevel: strong` label means strong coverage,
not strong confirmation. Task 185 refers to this meaning as
`corroborationCoverageLevel`. "Independent" means observed separately from the
counter anchor and from distinct probe families; it does not mean statistical
or causal independence and does not prove Source 2 gameplay semantics.

Every anchor had a life-signal change candidate and a respawn-related
flag/boundary change candidate at normalized delta 0. No pawn-link change was
associated, and no later-cycle delta was used. These are independent observed
signal categories, but their Source 2 gameplay semantics are not proven by
field names. They remain correlation evidence, not death or respawn truth.

## Per-Replay Coverage

All rows in the `multi` column remain unconfirmed.

| Replay | Anchors | Multi | Ambiguous | Unmatched signals |
|---|---:|---:|---:|---:|
| replay_001 | 109 | 109 | 0 | 702 |
| replay_002 | 53 | 53 | 0 | 324 |
| replay_003 | 117 | 117 | 0 | 710 |
| replay_004 | 58 | 58 | 0 | 343 |
| replay_009 | 84 | 84 | 0 | 523 |
| replay_010 | 45 | 45 | 0 | 277 |
| replay_011 | 80 | 80 | 0 | 494 |
| replay_012 | 81 | 81 | 0 | 517 |
| replay_013 | 68 | 68 | 0 | 435 |
| replay_014 | 77 | 77 | 0 | 481 |
| replay_015 | 102 | 102 | 0 | 643 |
| replay_016 | 73 | 73 | 0 | 454 |
| replay_017 | 89 | 89 | 0 | 542 |
| replay_018 | 103 | 103 | 0 | 660 |
| replay_019 | 60 | 60 | 0 | 369 |
| replay_020 | 83 | 83 | 0 | 495 |
| replay_021 | 99 | 99 | 0 | 606 |
| replay_022 | 89 | 89 | 0 | 567 |
| replay_023 | 72 | 72 | 0 | 443 |
| replay_024 | 89 | 89 | 0 | 589 |
| replay_025 | 67 | 67 | 0 | 414 |
| replay_026 | 64 | 64 | 0 | 415 |
| replay_027 | 95 | 95 | 0 | 604 |
| replay_028 | 67 | 67 | 0 | 401 |
| replay_029 | 60 | 60 | 0 | 385 |
| replay_030 | 63 | 63 | 0 | 391 |
| replay_031 | 91 | 91 | 0 | 567 |
| replay_032 | 62 | 62 | 0 | 374 |
| replay_033 | 118 | 118 | 0 | 767 |
| replay_034 | 80 | 80 | 0 | 492 |
| replay_035 | 37 | 37 | 0 | 235 |
| replay_036 | 117 | 117 | 0 | 724 |

## Temporal Distribution

There were 5,104 associated signal candidates, all at normalized delta 0: two
candidate categories per anchor. Counts at -2, -1, +1, +2, and later 3–180
seconds were zero. The declared windows remain correlation heuristics, not
gameplay proof.

## Independence And Protection

Task 183 was used only as the temporal anchor. Task 182 verified the source
bridge but its count was not used as corroboration. No Task 181 bridge count,
copied count, synthetic positive evidence, or absence-to-positive conversion was
used. Replay 005 was untouched; replays 006–008 were not processed. Only
replay_001–004, replay_009, and replay_010–036 were processed, including the
explicitly authorized replay_020.

## Readiness Boundary

`readyForFinalDeathPromotionDesign` is true because the bounded evidence level
is `strong`. All emission and interpretation boundaries remain false: final
death facts, confirmed "who died", attribution, killer/victim, teamfight
detection, and gameplay interpretation require a separate future task.
