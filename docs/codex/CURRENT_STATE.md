# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 196 at `bf42beee0b22bd921c245ce1b6485a1b617543a8`. ChatGPT Work accepted the Functional Death-Candidate Detector MVP with blocker `detector_selectivity_not_demonstrated`. The MVP module is completed and preserves 2,664 deterministic unconfirmed structural candidates as the V1 baseline.

Active candidate: Task 197, `Death-Candidate Selectivity And Ranking V2`. Coordination status: `VALIDATING`.

The V2 configuration was selected on 24 development replays and frozen before the eight reserved validation replays were evaluated. It reduced the full list from 2,664 to 2,537 candidates, populated all three priority tiers, and changed p50/p90 from 1.0/1.0 to 0.884278/0.988167. Replay_010 was byte-identical across two executions.

The reserved-validation result is conclusively negative under `structural_features_insufficient_for_candidate_selectivity`. Anchor capture was 95.556%; hard-challenger capture was 90.909%; the 4.647-point difference is below the required 10 points. The list is ranked, but the existing structural features do not demonstrate adequate selectivity. No further tuning on these same signals is authorized by this handoff.

All 32 authorized replays were represented with zero failures. Replay 005 remained protected; replays 006-008 remained excluded bot fixtures. No final death fact, confirmed non-death, victim identity, attribution, killer/victim, teamfight or gameplay interpretation was produced.

ChatGPT Work must independently validate Task 197. Any later capability requires a separate authorization and new semantic evidence or ground truth. No Task 198 exists.

Machine-readable state: `data/project-coordination-state.json`.
