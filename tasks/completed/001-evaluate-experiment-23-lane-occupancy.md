# Task 001: Evaluate experiment 23 lane occupancy calibration

Status: completed

## Objective

Determine whether the calibrated lane occupancy model produced by experiment 23 is reliable enough to serve as input for lane-transition detection.

This task must produce a methodological decision package. It must not implement experiment 24.

## Context to read

Read only:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/EXPERIMENT_INDEX.md`
- `docs/DATA_DICTIONARY.md`
- `docs/DECISIONS.md`
- `experiments/22-build-lane-occupancy-model.js`
- `experiments/23-calibrate-lane-occupancy.js`
- outputs from experiment 22 that are directly read by experiment 23
- outputs beginning with `output/23-`
- reports directly related to experiments 22 or 23

Do not inspect unrelated experiments unless a concrete reference in experiment 22 or 23 requires it.

## Work requested

Analyze the implementation, inputs, outputs, calibration process, metrics, manual-review evidence, and methodological risks of experiment 23.

Answer:

1. What specific problem did experiment 23 attempt to correct?
2. What models or parameter configurations were compared?
3. What thresholds and heuristics were evaluated?
4. Which configuration was selected?
5. Which metrics caused it to be selected?
6. Do those metrics measure real classification accuracy or internal consistency?
7. Was ground truth used?
8. Was manual review used?
9. How many samples were manually reviewed?
10. How were those samples selected?
11. Which cases appear correct?
12. Which cases appear incorrect?
13. Which cases remain ambiguous?
14. How are deployment-area samples represented?
15. How are brief lane contacts represented?
16. Is there evaluation circularity?
17. Is the selected model overfitted to `partida_001.dem`?
18. Can the same calibration be reproduced on another replay?
19. What is the smallest next experiment capable of validating or falsifying the model?

## Quantitative extraction

Extract when available:

- players evaluated
- match duration evaluated
- total classified coverage
- lane-classified duration
- unknown duration
- deployment duration
- episode count
- episode-duration distribution
- brief-contact count
- rapid lane-change count
- temporal stability
- score for each candidate model
- difference between the selected model and alternatives
- manually reviewed sample count
- reviewed correct, incorrect, and ambiguous counts

Do not invent unavailable metrics.

List important missing metrics explicitly.

## Epistemic classification

Classify important conclusions as:

- `Fact`
- `Observed result`
- `Hypothesis`
- `Limitation`
- `Provisional decision`
- `Confirmed decision`

Spatial presence must not be interpreted as strategic intent.

## Compare possible next steps

Evaluate:

### Option A: stratified manual validation

Produce representative samples across players, lanes, deployment states, confidence levels, episode durations, brief contacts, and suspected transitions.

### Option B: threshold recalibration

Change distance, confidence, stability, duration, deployment, or fragmentation rules.

### Option C: validate on another replay

Run the same model against another compatible match to measure generalization.

### Option D: begin transition detection

Use current stable occupancy episodes to classify movement between lanes.

### Option E: another evidence-supported option

Only include this when the current evidence identifies a better direction.

For every option, report:

- uncertainty reduced
- expected benefit
- risk
- dependency
- implementation cost
- processing cost
- output produced
- whether it validates the existing model or merely adds another layer

Select one primary recommendation.

## Constraints

- Do not create experiment 24.
- Do not execute experiments.
- Do not reprocess replay files.
- Do not modify `output/*`.
- Do not modify experiment logic.
- Do not infer strategic intent.
- Do not treat internal consistency as ground truth.
- Do not read large JSON files fully when targeted extraction is sufficient.
- Do not change the latest completed experiment number.

## Acceptance criteria

The task is complete when:

- all requested methodological questions are answered
- model-selection logic is traceable to code and outputs
- available quantitative evidence is summarized
- missing evidence is explicitly listed
- validation quality is classified
- overfitting and circularity risks are evaluated
- options for experiment 24 are compared
- one recommendation and one falsifiable hypothesis are provided
- no experiment or replay-processing command was executed
- no output was changed

## Required validation

Run:

```bash
npm.cmd run validate:experiment -- 23
npm.cmd run check:outputs -- 23
npm.cmd run summarize:experiment -- 23
```

These commands are allowed only because they validate existing files and do not execute experiment 23.

Confirm with Git that `output/*` was not modified.

Do not rerun these commands after documentation-only changes unless necessary.

## Documentation updates

Create:

```text
reports/23-lane-occupancy-decision-packet.md
```

Use this structure:

```markdown
# Experiment 23 lane occupancy decision packet

## Problem investigated

## Pipeline

## Inputs

## Outputs

## Calibration method

## Candidate models

## Selection criteria

## Quantitative results

## Manual validation

## Evidence supporting the selected model

## Incorrect cases

## Ambiguous cases

## Missing evidence

## Circularity risk

## Overfitting risk

## Generalization readiness

## Current model status

### Ready for

### Not ready for

## Experiment 24 options

### Option A: stratified manual validation

### Option B: threshold recalibration

### Option C: another replay

### Option D: transition detection

### Option E

## Primary recommendation

## Falsifiable hypothesis

## Suggested success criteria

## Relevant files
```

Update:

```text
reports/latest.md
```

Update `docs/PROJECT_STATE.md` only if the methodological state changes. Do not change the latest experiment number.

Update `docs/DECISIONS.md` only if the analysis supports a real provisional or confirmed decision. Do not record the recommendation as confirmed merely because it was recommended.

## Git scope

The task may commit only:

- its task file
- `reports/23-lane-occupancy-decision-packet.md`
- `reports/latest.md`
- `docs/PROJECT_STATE.md`, if justified
- `docs/DECISIONS.md`, if justified
- queue-workflow files created or modified in Part 1

Do not commit outputs, replay files, external data, temporary files, or unrelated changes.

## Expected report

Return:

- selected configuration
- three principal quantitative findings
- type and strength of existing validation
- principal limitation
- primary recommendation for experiment 24
- falsifiable hypothesis
- files created or changed
- validation results
- commit hash

## Stop conditions

Block the task instead of making assumptions when:

- required experiment 23 outputs are unavailable
- output structures contradict the experiment code
- manual-review evidence referenced by the code cannot be found
- the selected configuration cannot be identified
- analysis would require replay reprocessing
- a conclusion depends on undocumented strategic interpretation
