> This roadmap does not authorize execution.
> Only files in `tasks/pending/` may be executed by the autonomous queue runner.

# Project Roadmap

This document records likely future work without promoting it to the executable queue. Roadmap order is not execution authorization.

## 1. Lane occupancy validation

- Proposed ID: 002
- Title: Build stratified lane occupancy validation
- Purpose: Prepare review samples, templates, local tooling, and scoring infrastructure for experiment 24.
- Known dependencies: experiment 23 decision packet.
- Reason it is not executable yet: executable only while present in `tasks/pending/`; completion stops at `awaiting_human_labels`.

- Proposed ID: 003
- Title: Label lane occupancy samples
- Purpose: Human reviewers label point and episode samples.
- Known dependencies: task 002 outputs.
- Reason it is not executable yet: human task; Codex must not execute, complete, or simulate labels.

- Proposed ID: 004
- Title: Score human lane validation
- Purpose: Score labeled point and episode samples and produce lane validation metrics.
- Known dependencies: task 003 human label gate.
- Reason it is not executable yet: labeled files and coverage gate do not exist.

- Proposed ID: 005
- Title: Revise lane occupancy model
- Purpose: Correct errors demonstrated by human validation.
- Known dependencies: task 004 gate `requires_model_revision`.
- Reason it is not executable yet: no scored human validation has demonstrated required corrections.

- Proposed ID: 006
- Title: Validate occupancy holdout
- Purpose: Compare original and revised models on holdout samples.
- Known dependencies: task 005 and a holdout protocol.
- Reason it is not executable yet: revised model and holdout protocol do not exist.

- Proposed ID: 008
- Title: Occupancy decision review
- Purpose: Decide whether to prioritize second-replay generalization or transition candidates after validation gates.
- Known dependencies: task 004 or task 006 gate evidence.
- Reason it is not executable yet: methodological prioritization is not a queue task and requires gate evidence.

## 2. Generalization

- Proposed ID: 007
- Title: Process second replay
- Purpose: Test whether the approved occupancy model generalizes beyond `partida_001.dem`.
- Known dependencies: first-replay validation approval and a compatible second replay.
- Reason it is not executable yet: approval and second replay availability are not established.

## 3. Spatial transitions

- Proposed ID: 009
- Title: Detect validated lane transitions
- Purpose: Detect stable origin occupancy, transit interval, and stable destination occupancy.
- Known dependencies: validation gate `validated_for_transition_candidates`.
- Reason it is not executable yet: occupancy model has not been human-validated for transition candidates.

- Proposed ID: 010
- Title: Validate lane transitions
- Purpose: Human/mixed validation of transition candidate categories.
- Known dependencies: task 009 transition candidates and review samples.
- Reason it is not executable yet: transition candidates do not exist.

## 4. Combat events

- Proposed ID: 011
- Title: Extract death, assist, and respawn events
- Purpose: Build a validated event layer for deaths, assists, and respawns.
- Known dependencies: reliable player timeline and event fields.
- Reason it is not executable yet: field mapping and validation scope are not fully specified.

- Proposed ID: 012
- Title: Build damage and healing segments
- Purpose: Segment hero damage, objective damage, healing, and related combat intervals.
- Known dependencies: reliable damage/healing counters and event validation.
- Reason it is not executable yet: counter semantics and reset behavior require research.

- Proposed ID: 013
- Title: Combine combat events into fight windows
- Purpose: Group deaths, assists, damage, and healing into candidate fights.
- Known dependencies: tasks 011 and 012.
- Reason it is not executable yet: upstream combat event layers do not exist.

## 5. Objectives and map state

- Proposed ID: 014
- Title: Map objective entities
- Purpose: Identify objective entity classes and stable identifiers.
- Known dependencies: validated entity field mapping.
- Reason it is not executable yet: scope and fields are not specified.

- Proposed ID: 015
- Title: Extract objective lifecycle
- Purpose: Track objective spawn, damage, destruction, and state changes.
- Known dependencies: objective entity mapping and validation samples.
- Reason it is not executable yet: lifecycle semantics and validation requirements are not fully specified.

- Proposed ID: 016
- Title: Build map state timeline
- Purpose: Combine objectives and spatial state into a time-indexed map layer.
- Known dependencies: objective lifecycle and spatial model validation.
- Reason it is not executable yet: validated objective lifecycle does not exist.

## 6. Economy

- Proposed ID: 017
- Title: Model soul economy
- Purpose: Build derived economy timelines for players and teams.
- Known dependencies: reliable soul, net worth, death, objective, and event semantics.
- Reason it is not executable yet: source fields and attribution rules require validation.

## 7. Descriptive macro layer

- Proposed ID: 018
- Title: Resolve string tokens
- Purpose: Resolve hero, item, ability, lane, and event token names used by outputs.
- Known dependencies: token tables or verified external mapping.
- Reason it is not executable yet: source-of-truth mapping is not selected.

- Proposed ID: 019
- Title: Build descriptive macro summaries
- Purpose: Produce descriptive summaries from validated occupancy, events, objectives, and economy layers.
- Known dependencies: validated upstream layers.
- Reason it is not executable yet: upstream layers are incomplete.

- Proposed ID: 020
- Title: Evaluate macro decisions
- Purpose: Compare decisions against context and outcomes.
- Known dependencies: several validated event layers and methodology.
- Reason it is not executable yet: decision-evaluation methodology is not defined.

## 8. Decision evaluation

- Proposed ID: 021
- Title: Define decision-evaluation rubric
- Purpose: Specify what can and cannot be judged from replay-derived evidence.
- Known dependencies: validated descriptive layers and methodological review.
- Reason it is not executable yet: requires scope and rubric decisions.

- Proposed ID: 022
- Title: Validate decision-evaluation samples
- Purpose: Human review of proposed decision-evaluation examples.
- Known dependencies: task 021 rubric and sample generator.
- Reason it is not executable yet: rubric and samples do not exist.

## 9. Multi-replay datasets

- Proposed ID: 023
- Title: Define replay intake protocol
- Purpose: Specify compatibility, metadata, privacy, and storage rules for additional replays.
- Known dependencies: project policy decisions.
- Reason it is not executable yet: intake policy is not specified.

- Proposed ID: 024
- Title: Standardize multi-replay dataset
- Purpose: Normalize outputs across multiple compatible replays.
- Known dependencies: replay intake protocol and at least two compatible replay pipelines.
- Reason it is not executable yet: second replay and dataset schema are not established.

## 10. Statistical analysis

- Proposed ID: 025
- Title: Build statistical analysis layer
- Purpose: Analyze validated multi-replay datasets.
- Known dependencies: standardized multi-replay dataset and metric definitions.
- Reason it is not executable yet: dataset and metric definitions do not exist.

- Proposed ID: 026
- Title: Validate statistical findings
- Purpose: Review robustness, sampling bias, and uncertainty of statistical outputs.
- Known dependencies: task 025 outputs.
- Reason it is not executable yet: no statistical findings exist.

## 11. Machine learning

- Proposed ID: 027
- Title: Explore machine-learning models
- Purpose: Test whether validated datasets support predictive or clustering models.
- Known dependencies: validated multi-replay datasets and statistical baselines.
- Reason it is not executable yet: data volume, labels, and target definitions are not established.

## Conditional Branches

After task 004:

- `validated_for_transition_candidates` -> task 009 may be promoted after explicit gate verification
- `requires_model_revision` -> task 005 may be promoted
- `insufficient_human_labels` -> task 003 remains incomplete; no autonomous task is promoted

After task 006:

- `approved_on_holdout` -> task 007 or task 009 may be considered
- `failed_on_holdout` -> return to a new model-revision decision
- `insufficient_holdout_labels` -> human labeling remains required

Codex must not choose between task 007 and task 009 autonomously. That prioritization belongs to the methodological review.
