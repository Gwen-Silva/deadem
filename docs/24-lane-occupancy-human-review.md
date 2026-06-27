# Experiment 24 human lane occupancy review

Experiment 24 is a validation-infrastructure step. It does not validate the lane occupancy model until human labels are completed and scored.

## Files to review

- `output/24-point-review-unlabeled-template.json`
- `output/24-episode-review-unlabeled-template.json`

Reviewers should save completed files as:

- `output/24-point-review-labeled.json`
- `output/24-episode-review-labeled.json`

## Local tool

Open `tools/24-lane-occupancy-review.html` in a browser, load one unlabeled template JSON, fill the review fields, then download the labeled JSON.

## Required labels

Each sample should preserve the original source fields and fill only the `review` object:

- `label`: `correct`, `incorrect`, or `ambiguous`
- `reviewedPhysicalLane`: `lane_1`, `lane_2`, `lane_3`, `deployment`, `base`, or `unknown`
- `reviewerConfidence`: `high`, `medium`, or `low`
- `observedEvidence`: concise evidence from replay or Explorer inspection
- `reviewer`: reviewer identifier
- `reviewedAt`: timestamp
- `notes`: optional

## Minimum gate

The next autonomous scoring task requires:

- at least 60 non-ambiguous point samples
- at least 30 non-ambiguous episode samples
- all three lanes represented
- all 12 players represented
- early, middle, and late match phases represented

## Non-goals

- Do not infer strategic intent.
- Do not evaluate whether a rotation was good or bad.
- Do not revise model thresholds during labeling.
- Do not fabricate labels from the model output itself.

## Gate

The current machine-readable gate is:

```text
awaiting_human_labels
```

Completion of task 002 means the review infrastructure is ready. It does not mean experiment 24 has been scientifically validated.
