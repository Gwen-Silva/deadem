# Task 197 - Build Death-Candidate Selectivity And Ranking V2

Status: completed

Base: `bf42beee0b22bd921c245ce1b6485a1b617543a8`

Technical gate claim: `structural_features_insufficient_for_candidate_selectivity`

The deterministic V2 layer consumes the preserved Task 196 candidate artifact, assigns a structural priority score, ranks rows within each replay, and publishes high, medium and low tiers. Evaluation labels are attached only after scoring.

The configuration was selected on the declared 24-replay development split and frozen before evaluating the eight reserved replays. Development showed 94.797% anchor capture and 84.058% hard-challenger capture, a 10.739-point difference. Reserved validation showed 95.556% and 90.909%, respectively, only 4.647 points apart. The required 10-point separation therefore did not generalize.

Across all 32 authorized replays, V2 reduced 2,664 candidates to 2,537 and changed score p50/p90 from 1.0/1.0 to 0.884278/0.988167. The output populated 1,125 high, 1,073 medium and 339 low rows. Two replay_010 builds were byte-identical.

This is a useful conclusive negative: the current structural features are insufficient for the required selectivity. Further progress requires new semantic evidence or ground truth, not additional tuning on the same signals.

Every row remains an unconfirmed structural hypothesis. Zero protected replay access, final facts or attribution occurred. Final acceptance remains pending independent ChatGPT Work validation. No Task 198 is created by this handoff.
