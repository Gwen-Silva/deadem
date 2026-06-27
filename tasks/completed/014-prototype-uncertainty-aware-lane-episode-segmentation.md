# Task 014: Prototype Uncertainty-Aware Lane Episode Segmentation

Status: completed
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 006 failed_on_holdout; task 013 gate equals episode_revision_failed
Unlocked by: user authorization to continue autonomous architectural feasibility investigation after episode_revision_failed
Blocks: later lane-episode methodology decision

## Objective

Determine whether the current point-classification-first architecture is the primary limitation by prototyping uncertainty-aware sequential episode models that infer occupancy episodes from evidence over time instead of requiring every individual point to receive a stable lane label.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `reports/24-autonomous-lane-occupancy-evidence-audit.md`
- `reports/24-lane-occupancy-model-revision.md`
- `reports/24-occupancy-holdout-validation.md`
- `reports/24-episode-regression-diagnosis.md`
- outputs produced by those investigations
- `experiments/23-calibrate-lane-occupancy.js`
- `experiments/24-revise-lane-occupancy-model.js`
- `experiments/24-validate-occupancy-holdout.js`
- `experiments/24-diagnose-lane-occupancy-episode-regression.js`
- directly referenced geometry, movement, topology, and region artifacts

## Work requested

Prototype and compare:

- hysteresis state machine;
- interval evidence accumulation;
- constrained dynamic programming;
- original experiment 23 episodes with evidence annotations;
- control models: original experiment 23 episodes, failed conservative revision, best previous ablation if identifiable, and trivial abstention baseline.

Separate observation evidence, latent occupancy state, and episode evidence. Treat existing audit, revision, holdout, and regression sets as development and diagnostic evidence only.

## Constraints

- Do not claim semantic correctness.
- Do not detect rotations.
- Do not process another replay.
- Do not request human review unless architectures remain indistinguishable for a decision that materially blocks progress.
- Do not inspect unrelated experiments.
- Do not overwrite previous outputs.
- Keep outputs below 10 MiB.
- Do not tune against one aggregate score.
- Do not create a fresh holdout from already inspected or indirectly optimized samples.

## Inputs

Existing experiment 23 and 24 outputs, movement metrics, region/topology artifacts, and diagnostic reports listed in context.

## Outputs

- `output/24-sequential-observation-evidence.json`
- `output/24-hysteresis-occupancy-episodes.json`
- `output/24-windowed-evidence-occupancy-episodes.json`
- `output/24-dynamic-programming-occupancy-episodes.json`
- `output/24-annotated-original-occupancy-episodes.json`
- `output/24-sequential-architecture-comparison.json`
- `output/24-sequential-architecture-sensitivity.json`
- `output/24-sequential-architecture-gate.json`
- `reports/24-uncertainty-aware-episode-architecture.md`

## Acceptance criteria

- Candidate architectures are implemented in an isolated experiment script.
- Every candidate reports observation, episode, distribution, and trade-off metrics.
- The report distinguishes diagnostic feasibility from validation.
- Exactly one allowed gate result is produced:
  - `sequential_architecture_promising`
  - `original_episode_annotation_preferred`
  - `semantic_ground_truth_required`
  - `no_architecture_resolves_tradeoff`
  - `insufficient_data_for_architecture_comparison`
- No previous outputs are modified.

## Required validation

- ESLint on new or modified JavaScript.
- JSON parsing for new outputs.
- Output-size checks.
- Task queue validation.
- Deterministic repeatability check.
- Parameter-sensitivity checks.
- Git check confirming previous outputs were not modified.

## Gate result

Write the gate to `output/24-sequential-architecture-gate.json`.

## Documentation updates

Update `reports/latest.md`, `docs/PROJECT_STATE.md`, and `docs/DECISIONS.md` only when justified by the result.

## Git scope

Use explicit staging only. Commit this task separately and push to `origin/main`.

## Expected report

The report must include the architectural problem, observation-versus-latent-state distinction, candidate definitions, parameter rationale, comparison results, diagnostic-set limitations, coverage and abstention trade-offs, contradiction and fragmentation trade-offs, sensitivity, selected architecture if any, rejected candidates, conclusions allowed, conclusions prohibited, required next evidence, and gate result.

## Stop conditions

Stop when the task completes and no pending task remains, when semantic human review is required, or when a methodological decision is required.
