# Project Task History

This document is the Task 178 consolidated history map. It summarizes versioned evidence from task files, reports, docs, registry entries, and git history. It does not use replay bytes and does not create gameplay facts.

## Evidence Rules

- Factual versioned evidence comes from committed task specs, completed/blocked files, reports, docs, registry entries, and git history.
- Inference from title or commit/report context is marked conservatively in `data/task-contribution-index.json`.
- Partial historical reconstruction is not a product claim.
- `eventCount` in death_validation artifacts remains a source-observed counter-transition candidate count, not a final death fact.

## Tasks 001-148: Foundation, policies, diagnostics, and protection

Problem resolved: This block built early factual and spatial experiments, replay protection posture, Codex task workflow, local replay canaries, and the long missing_entity_fail_closed diagnostic chain. It resolved many safety questions and narrowed parser failures, but most outputs are historical or supporting rather than the current product baseline.

Capabilities created: Replay protection, epistemic safety, task gates, parser diagnostics, source/canonical readiness groundwork.

Relevant artifacts: Historical reports under reports/; task specs/completed up to 148; missing entity diagnostics outputs.

Remaining limitations: Many spatial/canonical attempts are superseded by later compact death_validation work; missing-entity diagnosis was superseded by the upstream char decoder fix.

Baseline status: Mostly historical/supporting baseline; policies remain active.

## Tasks 149-155: Parser fix and post-fix readiness

Problem resolved: Applied upstream char-without-count decoder fix, consolidated missing_entity resolution, restored parser completion for replay_010 and replay_011, validated source/canonical readiness, and emitted only controlled manifests/artifacts.

Capabilities created: Parser default completion for the two local canaries, upstream update check, generic dry-run entrypoint, controlled source/canonical manifest emission.

Relevant artifacts: upstream-char-decoder-fix outputs; controlled-canonical-source-readiness; controlled-source-canonical-artifacts.

Remaining limitations: Does not prove total parser correctness; richer source classes remained blocked pending policy.

Baseline status: Active technical baseline for parser and readiness.

## Tasks 156-158: Birth of death_validation

Problem resolved: Reviewed blocked source classes, selected death_validation as the safest compact candidate, designed its schema, then emitted compact artifacts for replay_010 and replay_011.

Capabilities created: death_validation compact schema and controlled emission.

Relevant artifacts: death-validation-compact-schema and death-validation-compact-emission outputs.

Remaining limitations: death_validation is a counter-transition candidate validation artifact, not final death facts or attribution.

Baseline status: Active artifact-class baseline.

## Tasks 159-166: Batch readiness, dry-run, and mini-pilot

Problem resolved: Designed batch processing policy, implemented dry-run tooling, ran mini-pilots, and prepared expanded authorization without broadening beyond explicit manifests.

Capabilities created: Batch dry-run runner, mini-pilot, expanded dry-run authorization.

Relevant artifacts: batch-processing-readiness; batch-dry-run-readiness; expanded-death-validation-dry-run.

Remaining limitations: Dry-runs validate readiness but are not final artifacts.

Baseline status: Supporting baseline for later batch mode.

## Tasks 167-170: Exact-15, summary, and consumption contract

Problem resolved: Selected the exact-15 replay set, emitted compact artifacts, summarized them, and defined safe consumption boundaries.

Capabilities created: exact-15 death_validation baseline, compact summary, consumption contract.

Relevant artifacts: exact-15-death-validation-selection/emission/summary/consumption-contract outputs.

Remaining limitations: Exact-15 is superseded as active coverage by bounded 32, but the consumption contract remains active.

Baseline status: Historical baseline plus active contract.

## Tasks 171-175: Manifest-driven batch runner, batch mode, and provenance fix

Problem resolved: Implemented allowlisted batch emission, separated parity and batch modes, smoked batch mode, expanded to 16, and fixed manifest-driven provenance.

Capabilities created: Manifest-driven runner, parity mode, batch mode, provenance metadata.

Relevant artifacts: allowlisted-death-validation-batch-runner outputs and expanded_16 provenance-fix batch.

Remaining limitations: Expanded-16 is superseded by Task 177 as active coverage, but runner/provenance remain active.

Baseline status: Active infrastructure; superseded coverage baseline.

## Task 176: Bounded inbox blocked by no new candidates

Problem resolved: Performed filename-only inbox inventory and correctly blocked execution because no new eligible candidates were present.

Capabilities created: Filename-only inventory discipline and no-new-candidates gate.

Relevant artifacts: bounded-inbox inventory outputs.

Remaining limitations: No batch was executed and no new artifacts emitted.

Baseline status: Historical blocked state, superseded by Task 177 when new files appeared.

## Task 177: Bounded batch real run of 32 replays

Problem resolved: Mapped partida_021 through partida_036 to replay_021 through replay_036, ran the bounded 32 manifest, and emitted compact death_validation artifacts with Task 177 provenance.

Capabilities created: Current bounded 32 death_validation baseline.

Relevant artifacts: bounded_inbox_batch_pilot_32_task177 outputs.

Remaining limitations: Still not final death facts, attribution, or gameplay interpretation.

Baseline status: Active baseline.

## Active Baseline

The active baseline after Task 177 is `bounded_inbox_batch_pilot_32_task177`: a protected 32-replay compact `death_validation` batch. It is useful for safe validation and trend inspection under the consumption contract, but it is not sufficient to answer who killed whom, whether an event was a teamfight, or any strategic gameplay question.

## Superseded Baselines

The exact-15 and expanded-16 batches remain useful historical references and overlap-stability checks. They are superseded as coverage ceilings by Task 177. Parser missing-entity diagnostics before Task 149 are superseded by the upstream char decoder fix for replay_010 and replay_011, but they remain historical evidence for why the fix mattered.

## Rework Risks

- Reopening missing_entity_fail_closed diagnostics without first checking upstream risks repeating Tasks 121-148.
- Treating death_validation event counts as deaths would violate the consumption contract.
- Expanding richer source classes without schema and policy review risks field values, large outputs, or gameplay interpretation leakage.
- Processing new replays outside explicit manifests risks replay protection violations.
