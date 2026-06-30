# Task 067: Evaluate Replay 009 Inspector Against User Review Workflows

Status: completed

Unlocked by: explicit authorization after Task 066 review

Blocked by: review of the generated replay-009 factual state inspector

## Current source state

Task 066 completed with:

- commit: `c7338fa`
- gate: `replay_009_factual_state_inspector_ready_with_constraints`
- inspector: `output/replay-009-inspection/index.html`
- serve command: `node tools/serve-replay-inspector.mjs --dir output/replay-009-inspection`

Loaded data:

- 787 canonical records
- 423 timeline events
- 364 non-timeline metadata records
- 12 players
- 80 entities
- 187 snapshots
- 37 validation overlays
- 0 unmatched overlays

## Objective

Evaluate whether the replay-009 inspector supports realistic human review workflows accurately, efficiently, and without encouraging semantic overreach.

This task evaluates usability, discoverability, factual correctness, filter consistency, provenance visibility, uncertainty visibility, workflow completion, and misinterpretation risk.

It must not create new gameplay facts, infer macro decisions, apply mechanic effects, resolve build `23916427`, add spatial conclusions, reinterpret deletion as destruction, or reinterpret candidate entities as confirmed mechanics.

## Evaluation model

Use deterministic scripted workflows plus bounded single-reviewer technical inspection.

Do not claim broad user research unless multiple real users actually participate.

Classify evidence as:

- `automated functional validation`
- `single-reviewer technical inspection`
- `multi-user validation`
- `not tested`

If only Codex performs the review, state: `single-reviewer technical inspection`, not independent usability research.

## Required workflows

Evaluate all workflows below:

1. Find a player death.
2. Review a respawn sequence.
3. Compare team net worth.
4. Inspect a Mid Boss event.
5. Inspect a Walker.
6. Inspect Guardian limitations.
7. Inspect Patron/base ambiguity.
8. Inspect Spirit Urn candidates.
9. Check Rejuvenator availability.
10. Inspect non-timeline metadata.
11. Export factual reports for Mid Boss, one player life-state filter, and candidate-only Spirit Urn.
12. Compare CLI, inspector, and export counts for deterministic filter sets.

Required parity filters:

- event type = `player_dead`
- mechanic = `mid_boss`
- validation status = `visually_supported`
- candidate only = `true`
- player = one selected player key

Any mismatch must be investigated.

## Required outputs

Create:

- `output/replay-009-inspection-evaluation/workflow-results.json`
- `output/replay-009-inspection-evaluation/usability-scorecard.json`
- `output/replay-009-inspection-evaluation/misinterpretation-risk-audit.json`
- `output/replay-009-inspection-evaluation/cli-interface-parity.json`
- `output/replay-009-inspection-evaluation/issues.json`
- `output/replay-009-inspection-evaluation/evaluation-summary.json`
- `output/replay-009-inspection-evaluation/evaluation-gate.json`
- `output/replay-009-inspection-evaluation/README.md`
- `reports/replay-009-inspector-workflow-evaluation.md`

If interface corrections are made, regenerate `output/replay-009-inspection/` and update focused tests.

## Gate

Produce exactly one:

- `replay_009_inspector_workflows_validated`
- `replay_009_inspector_workflows_validated_with_gaps`
- `replay_009_inspector_workflows_not_ready`
- `replay_009_inspector_workflows_blocked`

Use `validated` only when all required workflows pass, no critical or high issue remains, CLI/interface/export parity holds, semantic limits are clearly visible, and candidate and validation statuses remain correct.

Use `validated_with_gaps` when the interface is usable but medium or bounded workflow limitations remain.

## Follow-up behavior

If validated or validated with gaps:

- create one blocked task to define the next project milestone based on verified capabilities and remaining dependencies;
- do not create a macro-analysis implementation task automatically;
- do not release replay 005.

If critical/high interface issues remain:

- create one blocked remediation task;
- do not advance the project milestone.

If a canonical defect is found:

- create one narrow blocked canonical-correction task.

## Validation

Run:

- all Task 066 tests;
- workflow automation tests;
- CLI/interface parity tests;
- export parity tests;
- candidate-label tests;
- validation-overlay scope tests;
- semantic-limit visibility tests;
- timeline/metadata separation tests;
- empty-state tests;
- accessibility checks;
- deterministic regeneration;
- JSON validation;
- ESLint;
- engine tests;
- video-pipeline tests;
- task queue validation;
- Markdown and README link validation;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- Git status validation.

## Documentation

Update:

- `README.md`
- `docs/PROJECT_STATE.md`
- `docs/REPOSITORY_GUIDE.md`
- `reports/INDEX.md`
- `output/README.md`

Document which review workflows are validated, which remain limited, whether the evaluation was automated or single-reviewer, known misinterpretation risks, and how to reproduce the evaluation.

Do not describe a single-reviewer technical inspection as broad usability validation.

## Git

Use explicit staging only.

Commit only workflow evaluation tooling, compact evaluation outputs, interface corrections, focused tests, reports, documentation, and task files.

Do not commit replay files, videos, frames, browser caches, screenshots unless compact and specifically required, mechanic effects, or strategic conclusions.
