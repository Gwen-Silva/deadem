# Decisions

## DEC-001: Use Repository Docs As Persistent Context

Status: accepted

Date: 2026-06-27

Decision: Future Codex runs should read repository docs and task files before relying on chat history.

Reason: The experiment loop has accumulated enough state that conversation-only context is fragile and expensive.

## DEC-002: Preserve Existing Outputs Unless Regeneration Is Explicit

Status: accepted

Date: 2026-06-27

Decision: Existing `output/*` files should not be altered by documentation, workflow, or validation tasks.

Reason: Outputs are evidence for previous experiments and are used by later analyses.

## DEC-003: Keep New Experiments Isolated And Numbered

Status: accepted

Date: 2026-06-27

Decision: New experiments should use `experiments/NN-description.js` and write `output/NN-*.json`.

Reason: Numeric prefixes make provenance and validation simple.

## DEC-004: Validate Experiments Without Rerunning Them

Status: accepted

Date: 2026-06-27

Decision: Workflow validation scripts should lint experiment scripts, parse JSON outputs, and check output sizes without executing replay processing.

Reason: Validation should be cheap, repeatable, and safe for large replay-derived artifacts.

## DEC-005: Do Not Use Lane Occupancy For Transition Detection Yet

Status: accepted

Date: 2026-06-27

Decision: Lane occupancy is not ready for reliable transition, combat, objective, or macro-event detection.

Reason: Experiment 23 reports `readyToDetectTransitions: false`, despite improved coverage from calibrated models.

## DEC-006: Validate Lane Occupancy Manually Before Experiment 24 Transitions

Status: superseded

Date: 2026-06-27

Decision: The next methodological step should be stratified manual validation of experiment 23 lane occupancy states before threshold recalibration or transition detection.

Reason: Experiment 23 selected the `balanced` model using internal consistency metrics, but it did not include completed ground-truth or Explorer validation.

## DEC-007: Exhaust Autonomous Evidence Before Broad Human Lane Labels

Status: provisional

Date: 2026-06-27

Decision: Lane occupancy validation should run autonomous independent-evidence, sensitivity, stability, and cross-model audits before requesting broad human labels.

Reason: Experiment 24 autonomous audit found mechanical contradictions and high point sensitivity that can be addressed before escalating to semantic human review. Human review remains valid ground truth, but should be minimized to unresolved decision-relevant questions.

## DEC-008: Prefer Conservative Abstention For Mechanical Lane Occupancy Failures

Status: superseded

Date: 2026-06-27

Decision: Mechanical lane occupancy failures should be corrected by conservative abstention, base/deployment precedence, separation ambiguity, transit filtering, and spatial continuity before any transition detection.

Reason: Task 005 reduced autonomous point contradictions from 35 to 0 and point sensitivity from 63.33% to 10%, but lane coverage dropped from 53.39% to 10.19%. This requires holdout audit and does not establish semantic correctness.

## DEC-009: Do Not Use Conservative Revision After Failed Holdout

Status: provisional

Date: 2026-06-27

Decision: The task 005 conservative revision must not be used for downstream lane transitions or semantic lane claims.

Reason: Task 006 holdout validation reduced point contradictions and instability but increased episode contradictions from 12 to 75 on holdout windows.

## DEC-010: Do Not Continue Automatic Episode Tuning After Failed Ablations

Status: provisional

Date: 2026-06-27

Decision: Do not continue autonomous lane-episode tuning from the failed experiment 24 revision without a methodological decision.

Reason: Task 013 identified short abstentions terminating episodes as the dominant regression source, but no controlled ablation preserved point gains while resolving episode contradictions. Continuing to tune against the observed holdout would create leakage.

## DEC-011: Treat Current Lane-Episode Architecture Evidence As Exhausted

Status: provisional

Date: 2026-06-27

Decision: Do not continue autonomous lane-episode architecture tuning on the current single-replay diagnostic evidence.

Reason: Task 014 tested hysteresis, interval evidence accumulation, constrained dynamic programming, and annotated original episodes. The tested architectures preserved point-level gains only by retaining abstention, but did not recover usable episode continuity and coverage. Selecting the next path now requires a methodological decision or new independent evidence, not more tuning against observed diagnostics.

## DEC-012: Treat Descriptive Spatial Evidence As Non-Semantic Point Evidence

Status: accepted

Date: 2026-06-28

Decision: The supported spatial layer is limited to physical lane-axis proximity, separation, and base/deployment exclusion at individual timestamps.

Reason: Task 026 showed cross-replay consistency for point-level proximity evidence, while semantic occupancy, reliable episodes, and transitions remain unsupported. Task 027 removed the five-second temporal confound for replays 001-004 with one-second spatial extraction, but did not validate semantic lane occupancy.

## DEC-013: Do Not Use Frozen Occupancy Candidates For Episodes After One-Second Comparison

Status: accepted

Date: 2026-06-28

Decision: The frozen occupancy candidates may support descriptive point-level proximity evidence, but must not be used for reliable occupancy episodes, lane transitions, rotations, or replay 005 final-holdout claims.

Reason: Task 028 found small point-coverage deltas but material episode-count and fragmentation deltas when moving from five-second to one-second timelines. The comparison remains useful for resolution sensitivity, not semantic validation.

## DEC-014: Freeze Semantic Lane-Occupancy Episodes And Pivot To Independent Event Layers

Status: accepted

Date: 2026-06-28

Decision: Autonomous work on semantic lane-occupancy episodes, transition detection, rotation detection, and further occupancy architecture search is frozen. The approved spatial output is a factual point-level evidence layer: direct coordinates, physical lane-axis projections, nearest-lane distance, separation evidence, base/deployment exclusion, movement measurements, and resolution-sensitivity analysis. The project should pivot to independent event layers that do not require occupancy semantics.

Reason: One-second extraction removed the main technical resolution confound, but task 028 showed episode count and fragmentation remain materially architecture- and resolution-sensitive. Independent event layers such as death, assist, respawn, damage, and healing can be investigated without claiming semantic lane occupancy or using replay 005.

## DEC-015: Treat Damage And Healing As Descriptive Counter Deltas

Status: accepted

Date: 2026-06-28

Decision: Damage and healing fields may be used as reproducible per-player cumulative counter deltas across replays 001-004, but they must not be used to define fights, judge combat quality, infer intent, or attribute source-target combat without additional direct evidence.

Reason: Task 030 found stable changing counters for hero damage, objective damage, hero healing, and self healing, but did not expose victim-linked damage logs or source-target event streams. The outputs support temporal feasibility analysis with limitations, not semantic fight construction.

## DEC-016: Treat Objective Lifecycle As Descriptive Map-State Evidence

Status: accepted

Date: 2026-06-28

Decision: Objective entities and lifecycle events may be used as factual map-state evidence across replays 001-004, with structural lane-axis relationships and replay-observed health/state changes. They must not be used to judge objective decisions, infer intent, define fights, or attribute player source-target damage without direct evidence.

Reason: Task 031 found stable objective identities and lifecycle events across replays 001-004, but objective-damage counter timing does not exactly reconcile with visible health loss and optional phase/protection semantics remain limited. The layer is ready for descriptive match state with limitations, not strategic evaluation.

## DEC-017: Use Unified Match State For Factual Queries Only

Status: accepted

Date: 2026-06-28

Decision: The unified match-state timeline may combine validated player position, alive/dead, economy, damage/healing delta, and objective-state layers for factual per-second state queries across replays 001-004. It must not be used to define fights, evaluate decisions, infer strategic intent, claim semantic lane occupancy, detect rotations, or process replay 005.

Reason: Task 032 successfully joined the validated descriptive layers with deterministic replay-isolated shards and a `match_state_timeline_ready` gate. The layer is intentionally descriptive; it preserves the limitations of each source layer rather than upgrading them into strategic or semantic conclusions.

## DEC-018: Keep Match 91119257 As Manual Landmark Evidence Until Identity Is Resolved

Status: accepted

Date: 2026-06-28

Decision: The match 91119257 packet may be preserved and used as manual landmark annotation evidence, but it must not be used for demo-video alignment, tracked-player telemetry, world-to-minimap calibration, macro-event validation, or strategic conclusions until the demo/video identity conflict is resolved.

Reason: Task 033 parsed and preserved the packet, but the local candidate demo `samples/partida_006.dem` was not validated as the supplied match: duration did not match the post-game scoreboard duration and roster extraction failed. The final E088 timestamp correction remains a low-confidence unverified resolution until checked against video frames.

## DEC-019: Treat Match 91119257 Demo Identity As User-Overridden, Not Parser-Proven

Status: accepted

Date: 2026-06-28

Decision: `samples/partida_006.dem` may be used for limited continuation of the match 91119257 local packet only under explicit user override. The override is valid provenance for continuing analysis, but it is not parser proof of match ID or map identity.

Reason: Task 034 found the supplied local video, confirmed a 30:43 video duration, opened `partida_006.dem` through `Player`, found the user-named player in the demo, and extracted partial tracked-player telemetry. Parser match ID and map metadata remain unavailable, frame-level validation could not run without ffmpeg/ffprobe, and telemetry extraction stops early on a parser entity-linkage error. The outputs may support limited alignment and telemetry investigation, but not macro events, rotations, fights, strategic claims, world-to-minimap calibration, or E088 video confirmation.
