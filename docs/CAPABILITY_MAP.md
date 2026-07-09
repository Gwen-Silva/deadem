# Capability Map

Task 178 maps current Deadem capabilities from versioned evidence. Status values are active, superseded, historical, blocked, or needs-validation.

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
- Next dependency: Build a policy-safe alive/dead/respawn artifact before canonical death-event design.
