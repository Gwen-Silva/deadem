# Experiment 24 lane occupancy model revision

## Baseline

The revision preserved the experiment 24 autonomous audit baseline in:

- `output/24-occupancy-revision-baseline.json`

Baseline point evidence:

- `automatically_contradicted`: 35
- `automatically_supported`: 6
- `internally_consistent_only`: 29
- `unstable_under_perturbation`: 50

Baseline episode evidence:

- `automatically_contradicted`: 7
- `internally_consistent_only`: 65

Baseline point perturbation-change rate was 63.33%. Baseline episode perturbation-change rate was 0%.

Baseline lane coverage was 18,754 rows, or 53.39%.

Baseline episodes:

- stable episodes: 359
- brief contacts: 11,415
- brief-to-stable ratio: 31.8

## Demonstrated failure categories

The revision decomposed failures into mechanical categories before candidate evaluation:

- base or deployment samples admitted as lane occupancy
- weak nearest-lane separation
- envelope width sensitivity
- confidence-boundary sensitivity
- high-speed transit classified as occupancy
- brief contact classified as stable presence
- point and containing-episode disagreement
- fragmented episodes without meaningful spatial departure
- lane assignment near geometric boundaries
- classifications supported only by the selected model itself

Only mechanically demonstrated categories were corrected. Categories requiring semantic interpretation were documented but not corrected as truth labels.

## Candidate corrections

Candidate A: base/deployment precedence only.

Candidate B: separation and ambiguity handling.

Candidate C: transit and temporal stability handling.

Candidate D: combined conservative revision.

Candidate D was selected because it reduced point contradictions, point sensitivity, and episode contradictions without increasing episode contradiction count. It does this by abstaining aggressively, not by claiming semantic correctness.

## Causal trace

Base/deployment precedence:

```text
base/deployment samples admitted as lane occupancy
-> model-local baseState missed independent base/region evidence
-> reject lane occupancy when independent base/deployment evidence is strong
-> reduce base/deployment lane contradictions
```

Separation ambiguity:

```text
weak nearest-lane separation and boundary sensitivity
-> low-margin nearest-lane winner created brittle assignments
-> emit lane_ambiguous instead of lane occupancy near boundaries
-> reduce boundary instability
```

Transit filter:

```text
high-speed transit classified as occupancy
-> geometry-only lane proximity admitted fast movement samples
-> emit inter_lane_transit for high-speed samples
-> reduce transit-as-occupancy contradictions
```

Spatial continuity:

```text
stable episodes with spatial discontinuity or outside-lane positions
-> episode stability depended primarily on consecutive lane state and duration
-> require spatial continuity for stable episodes
-> reduce episode contradictions
```

## Before and after

Selected revision: `candidate_d_combined_conservative_revision`.

Point evidence:

- baseline contradictions: 35
- revised contradictions: 0
- baseline instability: 63.33%
- revised instability: 10%

Episode evidence:

- baseline contradictions: 7
- revised contradictions: 0
- revised episode instability: 1 sampled episode

Coverage and abstention:

- baseline lane rows: 18,754
- revised lane rows: 3,579
- coverage delta: -15,175 rows
- baseline coverage: 53.39%
- revised coverage: 10.19%
- abstention/non-lane rows increased by 15,175

The coverage loss is intentional conservative abstention and is reported as a major limitation. It must be evaluated on holdout before any downstream use.

Episode fragmentation:

- baseline stable episodes: 359
- revised stable episodes: 71
- baseline brief contacts: 11,415
- revised brief contacts: 2,193

The reduction reflects conservative abstention and spatial-continuity filtering. It does not prove semantic correctness.

## Regressions

No semantic regression can be claimed without labels.

Measured risks:

- lane coverage dropped sharply to 10.19%
- many former lane classifications became base, deployment, lane_ambiguous, inter_lane_transit, or unknown
- remaining point sensitivity is concentrated in lane_3 and middle phase samples

No episode contradiction increase was measured.

## Selected revision

Selected artifact:

- `output/24-revised-lane-occupancy.json`
- `output/24-revised-occupancy-episodes.json`

The revised model remains prohibited from semantic ground-truth claims and transition detection.

## Rejected revisions

Candidate A reduced contradictions but left higher point instability than the selected combined revision.

Candidate B reduced instability but left more point contradictions than the selected combined revision.

Candidate C addressed high-speed and continuity failures but did not address base/deployment and boundary failures.

## Gate result

```text
revision_ready_for_holdout
```

The gate means the revision is ready for non-circular autonomous holdout audit only.

It does not approve transition detection, strategic interpretation, or semantic correctness claims.

## Validation

Commands run:

```bash
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-revise-lane-occupancy-model.js
node experiments/24-revise-lane-occupancy-model.js
node -e "for (const f of ['output/24-occupancy-revision-baseline.json','output/24-occupancy-revision-candidates.json','output/24-revised-lane-occupancy.json','output/24-revised-occupancy-episodes.json','output/24-revised-autonomous-point-evidence-audit.json','output/24-revised-autonomous-episode-evidence-audit.json','output/24-revised-occupancy-sensitivity-analysis.json','output/24-occupancy-revision-comparison.json','output/24-occupancy-revision-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

All new revision outputs parse and remain below 10 MiB.

Git verification found no modified `output/22-*` or `output/23-*` files.
