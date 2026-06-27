# Task 008: Autonomous independent lane occupancy audit

Status: pending
Execution mode: autonomous
Project stage: Lane occupancy validation
Related experiment: 24
Priority: high
Depends on: task 002 validation infrastructure
Unlocked by: `output/24-point-review-samples.json` and `output/24-episode-review-samples.json` exist
Blocks: task 003, task 005, task 009

## Objective

Audit experiment 24 point and episode samples using independent machine-checkable evidence before requesting any human labels.

The workflow is:

```text
validation infrastructure
-> autonomous independent-evidence audit
-> sensitivity and stability audit
-> evidence consolidation
-> minimal human review only for unresolved cases
```

Do not fabricate ground truth. Do not label model predictions as correct merely because they agree with the model that generated them.

## Context to read

Read only:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/WORKFLOW.md`
- `reports/24-lane-occupancy-validation-infrastructure.md`
- `output/24-point-review-samples.json`
- `output/24-episode-review-samples.json`
- `output/23-calibrated-lane-occupancy.json`
- `output/23-calibrated-occupancy-episodes.json`
- `output/23-occupancy-model-comparison.json`
- `output/22-player-lane-occupancy-timeline.json`
- `output/22-stable-lane-occupancy-episodes.json`
- `output/09-canonical-player-timeline.json`
- `output/16-lane-topology-6592.json`
- `output/17-spatial-region-model.json`
- `output/17-player-region-timeline.json`
- `output/18-player-movement-metrics.json`

Do not reprocess the replay unless the task proves required evidence is unavailable from existing derived outputs.

## Work requested

Create an isolated experiment script for an autonomous independent-evidence audit.

For every point and episode sample, assign one evidence status:

- `automatically_supported`
- `automatically_contradicted`
- `internally_consistent_only`
- `unstable_under_perturbation`
- `unresolved`
- `not_independently_verifiable`

These statuses are evidence classifications, not semantic truth labels.

Each classification must include:

- sample ID
- model prediction
- evidence sources used
- evidence measurements
- supporting conditions
- contradictory conditions
- confidence
- reason
- whether human review is required
- exact question a human would need to answer

Evaluate available independent evidence, bounded sensitivity, cross-model agreement, and conservative contradiction rules. Document when a signal derives from the same decision rule and cannot be treated as independent confirmation.

## Constraints

- Do not alter the parser or package source.
- Do not reprocess `samples/partida_001.dem`.
- Do not modify previous outputs.
- Do not fabricate semantic ground truth.
- Do not use majority model agreement as ground truth.
- Do not promote transition detection from internal consistency.
- Keep generated JSON outputs below 10 MiB.

## Inputs

- experiment 24 sample outputs
- existing experiment 22 and 23 lane occupancy outputs
- existing canonical player, topology, region, and movement outputs

## Outputs

- `experiments/24-autonomous-independent-lane-occupancy-audit.js`
- `output/24-autonomous-point-evidence-audit.json`
- `output/24-autonomous-episode-evidence-audit.json`
- `output/24-occupancy-sensitivity-analysis.json`
- `output/24-cross-model-agreement.json`
- `output/24-independent-evidence-summary.json`
- `output/24-minimal-human-review-queue.json`
- `output/24-autonomous-validation-gate.json`
- `reports/24-autonomous-lane-occupancy-evidence-audit.md`

## Acceptance criteria

The task is complete when:

- every point sample has one evidence status
- every episode sample has one evidence status
- sensitivity analysis is produced
- cross-model agreement is produced
- conservative contradiction rules are traceable to measurements
- the minimal human-review queue includes only unresolved decision-relevant questions
- the autonomous gate is one of the allowed machine-readable results
- outputs parse and remain below 10 MiB

## Required validation

Run:

```bash
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js experiments\24-autonomous-independent-lane-occupancy-audit.js
node experiments/24-autonomous-independent-lane-occupancy-audit.js
node -e "for (const f of ['output/24-autonomous-point-evidence-audit.json','output/24-autonomous-episode-evidence-audit.json','output/24-occupancy-sensitivity-analysis.json','output/24-cross-model-agreement.json','output/24-independent-evidence-summary.json','output/24-minimal-human-review-queue.json','output/24-autonomous-validation-gate.json']) JSON.parse(require('node:fs').readFileSync(f, 'utf8'));"
npm.cmd run check:outputs -- 24
npm.cmd run validate:tasks
```

Confirm with Git that existing `output/22-*`, `output/23-*`, and task 002 `output/24-*-review*.json` files were not modified.

## Gate result

Allowed machine-readable results:

- `autonomous_evidence_supports_limited_use`
- `autonomous_evidence_requires_model_revision`
- `minimal_human_review_required`
- `insufficient_independent_evidence`

## Documentation updates

Create:

- `reports/24-autonomous-lane-occupancy-evidence-audit.md`

Update:

- `reports/latest.md`
- `docs/PROJECT_STATE.md`, only when justified
- `docs/DECISIONS.md`, only when justified

## Git scope

The task may commit only:

- this task file
- `experiments/24-autonomous-independent-lane-occupancy-audit.js`
- listed `output/24-autonomous-*`, `output/24-occupancy-sensitivity-analysis.json`, `output/24-cross-model-agreement.json`, `output/24-independent-evidence-summary.json`, `output/24-minimal-human-review-queue.json`
- `reports/24-autonomous-lane-occupancy-evidence-audit.md`
- `reports/latest.md`
- `docs/PROJECT_STATE.md`, if justified
- `docs/DECISIONS.md`, if justified

## Expected report

Separate:

- facts
- internal consistency
- independent evidence
- contradictions
- stability evidence
- unresolved semantics
- conclusions allowed without human ground truth
- conclusions still prohibited
- minimal human work required, if any

## Stop conditions

Stop when no executable pending tasks remain.

Block instead of guessing when:

- required existing derived evidence is missing
- output schemas cannot be connected to samples
- the audit would require replay reprocessing
- the gate would depend on fabricated semantic labels
