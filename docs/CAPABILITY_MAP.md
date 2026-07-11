# Capability Map

Task 178 maps current Deadem capabilities from versioned evidence. Status values are active, superseded, historical, blocked, or needs-validation.

## Autonomous Work–Codex coordination

- Capability id: `autonomous_work_codex_coordination`
- Introduced in Task 191; current status: `needs-validation`.
- Current baseline: Task 190 commit
  `13a3da64bcf0ba839a752038f07f40e3eeeed890` remains accepted; Task 191 is
  `VALIDATING`.
- Why it matters: Persists Work/Codex/Chat authority, ordered task contracts,
  review evidence and fail-closed protection against self-approval, rejected
  bases and fictitious surface activity.
- Main files: `docs/codex/AUTONOMOUS_COORDINATION_POLICY.md`,
  `data/project-coordination-state.json`, `scripts/codex-workflow.js`.
- Known limits: Repository code cannot launch or prove a real ChatGPT surface
  integration; `BLOCKED_BY_SURFACE` preserves continuity without simulation.
- Next dependency: Independent ChatGPT Work validation of the Task 191 commit.

## Upstream char field decoder fix

- Capability id: `parser_char_without_count_fix`
- Introduced in Task 149; stabilized in Task 150.
- Current status: `active`
- Current baseline: parser default completion for replay_010 and replay_011
- Why it matters: Resolved the missing_entity_fail_closed blockers by decoding scalar char fields as VAR_UINT_32 instead of null-terminated strings.
- Main files: `packages/engine/src/data/fields/FieldFactory.js`, `tests/fieldfactory-char-decoder.test.mjs`
- Main outputs: `output/local-replay-processing/upstream-char-decoder-fix-resolution/root-cause-summary.json`
- Known limits: Does not prove total parser correctness or Source 2 semantics.
- Next dependency: Keep upstream update check before deep parser investigations.

## Replay protection policy

- Capability id: `replay_protection`
- Introduced in Task 016; stabilized in Task 090.
- Current status: `active`
- Current baseline: docs/codex/REPLAY_PROTECTION.md
- Why it matters: Prevents accidental use of replay_005 and unsupported bot fixtures.
- Main files: `docs/codex/REPLAY_PROTECTION.md`, `AGENTS.md`
- Main outputs: none
- Known limits: Requires every task to restate explicit replay authorization.
- Next dependency: Maintain manifest-only authorization for expansion.

## Output and artifact policy

- Capability id: `output_artifact_policy`
- Introduced in Task 090; stabilized in Task 155.
- Current status: `active`
- Current baseline: compact audited local-replay-processing outputs
- Why it matters: Separates compact validation artifacts from final facts and raw/value-bearing data.
- Main files: `docs/codex/OUTPUT_AND_ARTIFACT_POLICY.md`
- Main outputs: `output/local-replay-processing/controlled-source-canonical-artifacts/output-policy-audit.json`
- Known limits: Policy permits compact death_validation only under current scope.
- Next dependency: Add schema-specific policies before richer source classes.

## Codex task validation gates

- Capability id: `task_validation_gates`
- Introduced in Task 090; stabilized in Task 092.
- Current status: `active`
- Current baseline: codex workflow validate/review scripts
- Why it matters: Enforces one-task scoped changes and review packets.
- Main files: `scripts/codex-workflow.js`, `tasks/specs/task-spec.schema.json`
- Main outputs: `.local/codex/<task>/review-packet.json`
- Known limits: Context packets can be sensitive to large git status before commit.
- Next dependency: Keep specs compact for large output tasks.

## death_validation compact schema

- Capability id: `death_validation_compact_schema`
- Introduced in Task 157; stabilized in Task 158.
- Current status: `active`
- Current baseline: death_validation compact artifact schema
- Why it matters: Provides compact counter-transition candidate validation without claiming deaths.
- Main files: `tools/emit-death-validation-compact-artifacts.mjs`, `tests/death-validation-compact-schema.test.mjs`
- Main outputs: `output/local-replay-processing/death-validation-compact-emission/artifacts/replay_010/death_validation.json`
- Known limits: eventCount is not a final death count; no attribution.
- Next dependency: Design identity and canonical death-event schemas before customer-facing death answers.

## Manifest-driven batch runner

- Capability id: `manifest_driven_batch_runner`
- Introduced in Task 171; stabilized in Task 175.
- Current status: `active`
- Current baseline: bounded_inbox_batch_pilot_32_task177
- Why it matters: Allows replay processing only through explicit allowlists.
- Main files: `tools/emit-allowlisted-death-validation-batch-artifacts.mjs`, `tests/emit-allowlisted-death-validation-batch-artifacts.test.mjs`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/allowlisted-batch-gate.json`
- Known limits: Current emission class is death_validation only.
- Next dependency: Use it for next semantic artifact classes after identity/death-event schema exists.

## Exact-15 parity mode

- Capability id: `parity_mode`
- Introduced in Task 171; stabilized in Task 171.
- Current status: `active`
- Current baseline: exact-15 parity manifest
- Why it matters: Compares regenerated compact artifacts to an existing exact-15 baseline when parity is required.
- Main files: `tools/emit-allowlisted-death-validation-batch-artifacts.mjs`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batch-runner/exact-15-parity-manifest.json`
- Known limits: Not required for batch mode expansion tasks.
- Next dependency: Use only when a fixed reference baseline must be preserved.

## Batch mode without parity reference

- Capability id: `batch_mode`
- Introduced in Task 172; stabilized in Task 173.
- Current status: `active`
- Current baseline: runnerMode=batch
- Why it matters: Runs authorized batches without requiring exact-15 reference status.
- Main files: `tools/emit-allowlisted-death-validation-batch-artifacts.mjs`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batches/exact_15_batch_mode_smoke/allowlisted-batch-gate.json`
- Known limits: Requires explicit manifest and protection audit.
- Next dependency: Use for future allowlisted expansion after policy review.

## Manifest generation provenance

- Capability id: `manifest_generation_provenance`
- Introduced in Task 175; stabilized in Task 175.
- Current status: `active`
- Current baseline: generatedAt task_177 for bounded 32
- Why it matters: Prevents misleading hardcoded task provenance in emitted artifacts.
- Main files: `tools/emit-allowlisted-death-validation-batch-artifacts.mjs`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batch-runner/provenance-fix-summary.json`
- Known limits: Relies on manifest metadata accuracy.
- Next dependency: Keep provenance checks in every batch expansion.

## Exact-15 death_validation baseline

- Capability id: `exact_15_baseline`
- Introduced in Task 168; stabilized in Task 171.
- Current status: `superseded`
- Current baseline: bounded_inbox_batch_pilot_32_task177
- Why it matters: First broader compact death_validation replay set.
- Main files: `tools/emit-exact-15-death-validation-compact-artifacts.mjs`
- Main outputs: `output/local-replay-processing/exact-15-death-validation-compact-emission/`
- Known limits: Superseded as active coverage by expanded 16 and bounded 32.
- Next dependency: Use as historical reference only.

## Expanded-16 death_validation baseline

- Capability id: `expanded_16_baseline`
- Introduced in Task 174; stabilized in Task 175.
- Current status: `superseded`
- Current baseline: bounded_inbox_batch_pilot_32_task177
- Why it matters: Added replay_020 with explicit authorization and fixed provenance.
- Main files: `tools/emit-allowlisted-death-validation-batch-artifacts.mjs`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batches/expanded_16_batch_mode_pilot_provenance_fix/`
- Known limits: No longer active ceiling after Task 177.
- Next dependency: Use for overlap stability checks.

## Bounded-32 active death_validation baseline

- Capability id: `bounded_32_active_baseline`
- Introduced in Task 177; stabilized in Task 177.
- Current status: `active`
- Current baseline: bounded_inbox_batch_pilot_32_task177
- Why it matters: Current largest protected compact death_validation batch.
- Main files: `tools/emit-allowlisted-death-validation-batch-artifacts.mjs`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/`
- Known limits: Still compact counter-transition validation, not final death facts or attribution.
- Next dependency: Build bounded summary or identity/death-event schema on top of compact outputs.

## Filename-only inbox inventory flow

- Capability id: `filename_only_inventory_flow`
- Introduced in Task 176; stabilized in Task 177.
- Current status: `active`
- Current baseline: inbox-inventory-task177
- Why it matters: Discovers candidates without reading replay bytes.
- Main files: `tasks/specs/176.json`, `tasks/specs/177.json`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batch-runner/inbox-inventory-task177/inbox-replay-inventory.json`
- Known limits: Only maps filenames; it does not validate replay contents.
- Next dependency: Continue using before any new replay authorization.

## Protection audits

- Capability id: `protection_audits`
- Introduced in Task 090; stabilized in Task 177.
- Current status: `active`
- Current baseline: per-task protection-audit.json outputs
- Why it matters: Records replay and output-safety compliance for each task.
- Main files: `docs/codex/REPLAY_PROTECTION.md`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batch-runner/bounded-inbox-batch-pilot-32-task177-protection-audit.json`
- Known limits: Audit is only as complete as the task instrumentation.
- Next dependency: Keep audits mandatory for all processing tasks.

## Schema/output/size audits

- Capability id: `schema_output_size_audits`
- Introduced in Task 155; stabilized in Task 177.
- Current status: `active`
- Current baseline: bounded 32 batch schema/output/size audits
- Why it matters: Prevents unsafe, oversized, or schema-invalid artifacts from becoming baselines.
- Main files: `scripts/check-output-sizes.js`
- Main outputs: `output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/schema-validation-summary.json`, `output/local-replay-processing/allowlisted-death-validation-batches/bounded_inbox_batch_pilot_32_task177/size-audit.json`
- Known limits: Known pre-existing oversized output/04-controller-pawn-lifecycle.json remains outside current task output.
- Next dependency: Keep artifact class limits explicit.

## Death validation consumption contract

- Capability id: `death_validation_consumption_contract`
- Introduced in Task 170; stabilized in Task 170.
- Current status: `active`
- Current baseline: exact-15 death_validation consumption contract
- Why it matters: Defines safe use of compact counter-transition outputs without treating them as final death facts.
- Main files: `reports/exact-15-death-validation-consumption-contract.md`
- Main outputs: `output/local-replay-processing/exact-15-death-validation-consumption-contract/safe-field-contract.json`
- Known limits: Does not authorize attribution, alive/dead state, or gameplay semantics.
- Next dependency: Extend only after identity/death-event schemas are designed.

## Upstream deadem update check

- Capability id: `upstream_deadem_update_check`
- Introduced in Task 153; stabilized in Task 153.
- Current status: `active`
- Current baseline: npm run check:upstream-deadem
- Why it matters: Reduces risk of long local parser investigations when upstream already fixed the issue.
- Main files: `tools/check-upstream-deadem-updates.mjs`, `tests/upstream-deadem-update-check.test.mjs`
- Main outputs: `output/local-replay-processing/upstream-update-check/update-decision.json`
- Known limits: Network failures require manual review.
- Next dependency: Run before deep parser debugging.

## Current Product-Safe Stack

1. Protected replay authorization.
2. Parser default completion after the upstream char decoder fix.
3. Compact source/canonical readiness and output policy.
4. death_validation compact schema.
5. Manifest-driven allowlisted batch runner.
6. Bounded 32-replay compact death_validation baseline.

The next product value layer should not skip identity mapping and canonical death-event schema work.

## Semantic Foundation Compact Layer

- Capability id: `semantic_foundation_compact`
- Introduced in Task 179; stabilized in Task 179.
- Current status: `active`
- Current baseline: semantic_foundation_compact_bounded32_task179
- Why it matters: Provides compact, policy-safe readiness signals for identity mapping, hero/team mapping, time/tick normalization, and alive/dead/respawn prerequisites without emitting final facts or gameplay interpretation.
- Main files: `tools/emit-semantic-foundation-compact-artifacts.mjs`, `schemas/semantic-foundation-compact.schema.json`, `tests/emit-semantic-foundation-compact-artifacts.test.mjs`, `tests/semantic-foundation-compact-schema.test.mjs`
- Main outputs: `output/local-replay-processing/semantic-foundation-compact/task179-gate.json`, `output/local-replay-processing/semantic-foundation-compact/task179-bounded32/`
- Known limits: Does not include player names, hero names, team names, entity IDs, field values, event rows, positions, attribution, canonical death events, or gameplay semantics.
- Next dependency: Design the first real identity mapping artifact before canonical death-event or teamfight work.

## Participant Identity Compact Layer

- Capability id: `participant_identity_compact`
- Introduced in Task 180; stabilized in Task 180.
- Current status: `active`
- Current baseline: participant_identity_compact_bounded32_task180
- Why it matters: Provides replay-local synthetic participant, controller, pawn, team, and hero refs without exposing names, raw IDs, handles, slots, field values, event rows, attribution, or final facts.
- Main files: `tools/emit-participant-identity-compact-artifacts.mjs`, `schemas/participant-identity-compact.schema.json`, `tests/participant-identity-compact-schema.test.mjs`, `tests/emit-participant-identity-compact-artifacts.test.mjs`
- Main outputs: `output/local-replay-processing/participant-identity-compact/task180-gate.json`, `output/local-replay-processing/participant-identity-compact/task180-bounded32/`
- Known limits: Refs are replay-local and synthetic; they are not names, raw IDs, final identity truth, death events, attribution, or gameplay interpretation.
- Next dependency: Continue supplying synthetic identity refs to the active Task 182, Task 183, and Task 184 layers.

## Alive Dead Respawn Compact Layer

- Capability id: `alive_dead_respawn_compact`
- Introduced in Task 181; stabilized in: none.
- Current status: `needs-validation`
- Current baseline: bridge-only Task 181.
- Superseded for active transition coverage by Task 182.
- Why it matters: Converts participant identity and compact death-counter bridge data into a policy-safe life-state summary layer before canonical death events.
- Main files: `tools/emit-alive-dead-respawn-compact-artifacts.mjs`, `schemas/alive-dead-respawn-compact.schema.json`, `tests/alive-dead-respawn-compact-schema.test.mjs`, `tests/emit-alive-dead-respawn-compact-artifacts.test.mjs`
- Main outputs: `output/local-replay-processing/alive-dead-respawn-compact/task181-gate.json`, `output/local-replay-processing/alive-dead-respawn-compact/task181-bounded32/`
- Known limits: Current safe inputs support aggregate transition candidate counts, not per-participant transition rows, final death facts, respawn events, attribution, raw ticks/timestamps, positions, or gameplay interpretation.
- Next dependency: Consume the Task 182 replay-sourced transition rows rather than the Task 181 bridge-only counts.

## Life-State Transition Candidates

- Introduced: Task 182
- Status: active
- Current baseline: `life_state_transition_candidates_bounded32_task182`
- Main files: `tools/emit-life-state-transition-candidates.mjs`,
  `schemas/life-state-transition-candidates.schema.json`
- Main outputs:
  `output/local-replay-processing/life-state-transition-candidates/task182-gate.json`
  and `task182-bounded32/`

Task 182 supersedes the active-coverage claim from Task 181. Task 181 remains
bridge-only scaffolding because it did not parse replays or materialize
transition rows.

The Task 182 capability emits replay-sourced death-counter increment candidate
rows with synthetic participant keys and normalized elapsed seconds. It does not
emit final death facts, raw IDs, raw ticks, raw timestamps, attribution,
positions, respawn final events, teamfight detection, or gameplay
interpretation.

Task 182 remains the active replay-sourced transition baseline consumed by Task
183 normalization and Task 184 anchor-bridge validation. It is not superseded by
either downstream layer.

## Death Event Candidates

- Capability id: `death_event_candidates`
- Introduced: Task 183
- Status: active
- Current baseline: `death_event_candidates_bounded32_task183`
- Main files: `tools/emit-death-event-candidates.mjs`,
  `schemas/death-event-candidates.schema.json`,
  `docs/codex/DEATH_EVENT_CANDIDATE_CONSUMPTION_CONTRACT.md`
- Main outputs:
  `output/local-replay-processing/death-event-candidates/task183-gate.json`
  and `task183-bounded32/`

Task 183 converts Task 182 replay-sourced life-state transition candidates into
normalized `death_event_candidates` using only versioned artifacts and Task 180
synthetic participant identity refs. Each candidate remains an unconfirmed
counter-increment candidate, not a final death fact. The layer supports bounded
questions about synthetic participant/hero/team refs and normalized seconds,
but still forbids killer/victim attribution, final death facts, respawn facts,
teamfight detection, raw IDs, raw ticks, raw timestamps, positions, names, and
gameplay interpretation.

## Death Event Corroboration Evidence

- Capability id: `death_event_corroboration_evidence`
- Introduced: Task 184
- Status: active
- Current baseline: `death_event_corroboration_evidence_bounded32_task184`
- Main files: `tools/emit-death-event-corroboration-evidence.mjs`,
  `schemas/death-event-corroboration-evidence.schema.json`,
  `docs/codex/DEATH_EVENT_CORROBORATION_EVIDENCE_CONTRACT.md`
- Main outputs:
  `output/local-replay-processing/death-event-corroboration-evidence/task184-gate.json`
  and `task184-bounded32/`

Task 184 uses Task 183 rows only as temporal anchors and measures independent
replay signal-change candidate coverage. It persists normalized deltas and
unconfirmed evidence classes only. It does not authorize final deaths,
confirmed "who died", attribution, killer/victim, teamfight detection, raw
values, raw IDs, raw time, positions, or gameplay interpretation.

Here, independence means observation separate from the death-counter anchor and
distinct probe families only. It does not mean statistical independence, causal
independence, or proven Source 2 semantics. Historical
`confirmationEvidenceLevel` values measure coverage strength only.

## Death Event Directional-Cycle Evidence

- Capability id: `death_event_directional_cycle_evidence`
- Introduced: Task 185
- Status: active
- Current baseline: `death_event_directional_cycle_evidence_bounded32_task185`
- Main files: `tools/emit-death-event-directional-cycle-evidence.mjs`,
  `schemas/death-event-directional-cycle-evidence.schema.json`,
  `docs/codex/DEATH_EVENT_DIRECTIONAL_CYCLE_EVIDENCE_CONTRACT.md`
- Main outputs:
  `output/local-replay-processing/death-event-directional-cycle-evidence/task185-gate.json`
  and `task185-bounded32/`

Task 185 reproduces abstract health-boundary, safely boolean-like alive,
life-state-signature, respawn-boundary, and pawn-link directions directly from
authorized replay processing. It associates at most one transition per source
family around each Task 183 anchor, measures later inverse cycles, distinguishes
replay-end censoring, and reports replay-wide negative controls.

The bounded-32 baseline passed technically with 2,552 rows, but its
`directionalCycleCoverageLevel` is `partial`: the unanchored equivalent-pattern
rate is 0.24067, above the predeclared strong limit of 0.05. Final death semantic
contract design therefore remains not ready. Tasks 180, 182, 183, and 184 remain
active and are not superseded.

## Matched Death-Event Directional Discrimination Evidence

- Capability id: `death_event_directional_discrimination_evidence`
- Introduced: Task 186
- Status: active
- Current baseline: `death_event_directional_discrimination_evidence_bounded32_task186`
- Main files: `tools/emit-death-event-directional-discrimination-evidence.mjs`,
  `schemas/death-event-directional-discrimination-evidence.schema.json`,
  `docs/codex/DEATH_EVENT_DIRECTIONAL_DISCRIMINATION_CONTRACT.md`

Task 186 restricts inversions to exact directional pairs, keeps recurrence
separate, and compares every Task 183 anchor with one deterministic
same-participant, same-quartile control where available. Bounded-32 selected
2,552/2,552 controls and achieved operational `strong` discrimination: both
multi-family direction and uncensored inverse association differed by 0.978448.

Task 185 remains active for observations. Task 186 supersedes it only for
corrected cycle aggregates and directional discrimination. Strong
discrimination does not confirm death truth; final facts remain unavailable.

## Death Event Semantic-Sequence Evidence

- Capability id: `death_event_semantic_sequence_evidence`
- Introduced: Task 187
- Status: active
- Current baseline: `death_event_semantic_sequence_evidence_bounded32_task187`
- Main files: `tools/emit-death-event-semantic-sequence-evidence.mjs`,
  `schemas/death-event-semantic-sequence-evidence.schema.json`,
  `docs/codex/DEATH_EVENT_SEMANTIC_SEQUENCE_CONTRACT.md`

Task 187 evaluates stable pre-state, explicit forward direction, post-transition
persistence, exact inverse recovery, counter-cycle uniqueness, and the exact
Task 186 matched controls. Bounded-32 emitted 2,552 anchor rows and evaluated
2,552 controls. Its assessment is `partial`, with 258 counter-before-recovery
violations reported. The layer is operational evidence only; it does not emit
final deaths or make operational promotion review ready.

## Segmented Death-Event Lifecycle Evidence

- Capability id: `death_event_segmented_lifecycle_evidence`
- Introduced: Task 188
- Status: active
- Current baseline: `death_event_segmented_lifecycle_evidence_bounded32_task188`
- Main files: `tools/emit-death-event-segmented-lifecycle-evidence.mjs`,
  `schemas/death-event-segmented-lifecycle-evidence.schema.json`,
  `docs/codex/DEATH_EVENT_SEGMENTED_LIFECYCLE_CONTRACT.md`

Task 188 requires each participating family to supply all five lifecycle stages
inside `[current anchor, next anchor)`, with controls censored at real anchors.
Bounded-32 emitted 2,552 rows and exact controls. Coherent segmented lifecycle
coverage is 0.846787 versus 0 for controls, yielding a `partial` assessment.
Task 188 supersedes Task 187 only for corrected segmented coherence; neither
layer confirms deaths or authorizes operational promotion review.

## Exposure-Matched Death-Event Lifecycle Evidence

- Capability id: `death_event_exposure_matched_lifecycle_evidence`
- Introduced: Task 189
- Status: active
- Current baseline:
  `death_event_exposure_matched_lifecycle_evidence_bounded32_task189`
- Main files: `tools/emit-death-event-exposure-matched-lifecycle-evidence.mjs`,
  `schemas/death-event-exposure-matched-lifecycle-evidence.schema.json`, and
  `docs/codex/DEATH_EVENT_EXPOSURE_MATCHED_LIFECYCLE_CONTRACT.md`

Task 189 validates all source bridges before replay access, requires the
stable pre-state to match the selected forward transition's origin, and limits
each anchor and exact Task 186 control to their shared observable follow-up.
Its bounded-32 assessment is `partial`: anchor/control coherence is
0.715714/0 among eligible pairs, while 0.992179 of coherent rows depend only on
the boolean/respawn pair and cross-surface support is 0.007821.

The capability supersedes Task 188 only for origin continuity, equal-exposure
comparison, and promotion readiness. It does not establish final death or
respawn truth, attribution, killer/victim, teamfight, or gameplay meaning.

## Surface-Resolved Death-Event Lifecycle Evidence

- Capability id: `death_event_surface_resolved_lifecycle_evidence`
- Introduced: Task 190
- Status: active
- Current baseline:
  `death_event_surface_resolved_lifecycle_evidence_bounded32_task190`
- Main files: `tools/emit-death-event-surface-resolved-lifecycle-evidence.mjs`,
  `schemas/death-event-surface-resolved-lifecycle-evidence.schema.json`, and
  `docs/codex/DEATH_EVENT_SURFACE_RESOLVED_LIFECYCLE_CONTRACT.md`

Task 190 uses symmetric nearest-event association, event-relative pre-state,
fresh ledgers for every 10/20/30/60/120/180-second horizon, a separately
rematched fixed-180 cohort curve, and abstract observation-surface provenance.
Bounded-32 emitted 2,552 exact pairs with zero source reuse. At the primary
30-second horizon, eligibility is 0.884013 and anchor/control coherence is
0.907358/0.000887. The result is `partial` because aggregate eligibility is
below 0.90 and only 12/32 replays meet local strong criteria.

Task 190 supersedes Task 189 only for the explicitly repaired event-window,
horizon, surface, truncation, audit, and promotion-readiness dimensions. It
does not establish death or respawn truth, attribution, killer/victim,
teamfight, or gameplay meaning.

## Hard-Challenger Lifecycle Specificity

- Capability id: `death_event_hard_challenger_lifecycle_specificity`
- Introduced: Task 192
- Status: candidate pending Work validation
- Current baseline: `task192-bounded32_hard_challenger_v1`

The layer independently compares Task 183 anchors with replay-sourced
structural challengers outside participant anchor windows. Its bounded result
is `insufficient` because only two challengers survive. It does not label them
as non-deaths and does not enable any final-fact or attribution capability.
