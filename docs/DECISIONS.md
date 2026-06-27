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

Status: provisional

Date: 2026-06-27

Decision: The next methodological step should be stratified manual validation of experiment 23 lane occupancy states before threshold recalibration or transition detection.

Reason: Experiment 23 selected the `balanced` model using internal consistency metrics, but it did not include completed ground-truth or Explorer validation.
