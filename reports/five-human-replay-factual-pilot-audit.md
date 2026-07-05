# Five Human Replay Factual Pilot Audit

## Frozen Acceptance Matrix

| Requirement | Classification |
| --- | --- |
| Audit exactly replays 001, 002, 003, 004, and 009. | required |
| Verify current accepted gate/source for each replay. | required |
| Verify replay 005 remains protected. | required |
| Verify 006-008 remain unsupported and unprocessed. | required |
| Measure or summarize processing duration from available artifacts. | required |
| Measure or summarize committed output size. | required |
| Summarize full package size where recorded. | required |
| Compare available categories across the five replays. | required |
| Compare schema compatibility status across the five replays. | required |
| Compare provenance status across the five replays. | required |
| Identify missing or unavailable categories. | required |
| Identify accepted limitations. | required |
| Decide whether the pilot is ready for a human milestone decision. | required |
| Do not create Task 097. | required |
| Do not begin spatial, mechanics, ML, macro, fight, pressure, rotation, role, or decision-analysis work. | required |
| Full corpus generalization. | explicit_non_goal |
| Replay 005 release. | explicit_non_goal |
| Spatial, mechanics, ML, macro, fight, pressure, rotation, role, or decision analysis. | explicit_non_goal |
| Compact manifests and full packages may coexist when documented. | accepted_limitation |
| Replay 002 v9 category counts are unavailable from current terminal audit artifacts. | accepted_limitation |
| Storage/cache redesign before scaling. | backlog |

Gate: `five_human_replay_factual_pilot_ready`

## Five Replay Status

| Replay | Gate | Gate source | Schema | Provenance | Representation |
| --- | --- | --- | --- | --- | --- |
| `replay_001` | `remaining_human_controls_canonicalized` | `output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json` | schema_identical | complete_for_emitted_records | compact_manifest_with_hashes_and_counts |
| `replay_002` | `replay_002_canonical_factual_state_ready_with_constraints_v9` | `output/replay-002-canonical-v9-validation/terminal-release-verification.json` | accepted_by_v9_terminal_validation | accepted_by_v9_terminal_validation; category-level provenance summary not reemitted in v9 artifacts | v9_terminal_validation_of_reused_canonical_facts |
| `replay_003` | `remaining_human_controls_canonicalized` | `output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json` | schema_identical | complete_for_emitted_records | compact_manifest_with_hashes_and_counts |
| `replay_004` | `remaining_human_controls_canonicalized` | `output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json` | schema_identical | complete_for_emitted_records | compact_manifest_with_hashes_and_counts |
| `replay_009` | `replay_009_canonical_factual_state_ready_with_constraints` | `output/replay-009-canonical/canonical-state-gate.json` | accepted_with_constraints | complete_for_accepted_canonical_package_with_constraints | full_canonical_package_committed |

## Category Coverage

Categories audited: player_identity, player_death, player_respawn, team_net_worth, raw_objective_structure_lifecycle, snapshots, metadata, entities, capabilities, independent_validation_overlay.
Forbidden semantic layers excluded: lanes, regions, proximity, map_transform, mechanic_effects, fights, rotations, pressure, macro, roles, decision_quality, objective_completion.

## Schema Compatibility

- `replay_001`: schema_identical.
- `replay_002`: accepted_by_v9_terminal_validation.
- `replay_003`: schema_identical.
- `replay_004`: schema_identical.
- `replay_009`: accepted_with_constraints.

## Provenance Summary

- `replay_001`: complete_for_emitted_records; source basis: output/five-replay-pilot/remaining-human-controls/replay_001/canonical-package-manifest.json; overlay: not_available_for_task_095.
- `replay_002`: accepted_by_v9_terminal_validation; category-level provenance summary not reemitted in v9 artifacts; source basis: output/replay-002-canonical-v9-validation; overlay: not_summarized_by_v9_terminal_artifacts.
- `replay_003`: complete_for_emitted_records; source basis: output/five-replay-pilot/remaining-human-controls/replay_003/canonical-package-manifest.json; overlay: not_available_for_task_095.
- `replay_004`: complete_for_emitted_records; source basis: output/five-replay-pilot/remaining-human-controls/replay_004/canonical-package-manifest.json; overlay: not_available_for_task_095.
- `replay_009`: complete_for_accepted_canonical_package_with_constraints; source basis: output/replay-009-canonical; overlay: 37 validation overlays; unmatched=0.

## Performance Baseline

- `replay_001`: 711ms (Task 095 performance-baseline.json).
- `replay_002`: not_available_from_current_artifacts (current artifacts do not record comparable timing).
- `replay_003`: 383ms (Task 095 performance-baseline.json).
- `replay_004`: 396ms (Task 095 performance-baseline.json).
- `replay_009`: not_available_from_current_artifacts (current artifacts do not record comparable timing).

## Storage Baseline

- `replay_001`: committed=3526 bytes; fullPackage=23995922 bytes; representation=compact_manifest_with_hashes_and_counts.
- `replay_002`: committed=26404 bytes; fullPackage=not_available bytes; representation=v9_terminal_validation_of_reused_canonical_facts.
- `replay_003`: committed=3526 bytes; fullPackage=16044406 bytes; representation=compact_manifest_with_hashes_and_counts.
- `replay_004`: committed=3525 bytes; fullPackage=14621259 bytes; representation=compact_manifest_with_hashes_and_counts.
- `replay_009`: committed=2132809 bytes; fullPackage=2132809 bytes; representation=full_canonical_package_committed.
Scaling note: Compact manifests keep committed output small for replays 001, 003, and 004. Full package commitment should be reviewed before scaling to 15 or 50 replays. Historical large outputs are excluded from this pilot scaling estimate.
Known output-size guard warning: output/04-controller-pawn-lifecycle.json.

## Protection Audit

Replay 005 accessed: false.
Bot fixtures processed: false.
Task 097 created: false.
Raw replay processing during Task 096: false.
Unsupported future layer started: false.

## Accepted Limitations

- This is a bounded factual foundation, not full corpus generalization.
- Replay 002 v9 current evidence is terminal-validation evidence and does not reemit category-level package counts.
- Replay 009 remains accepted with constraints from its canonical package.
- Comparable timing is unavailable for replay 002 and replay 009 from current artifacts.
- Storage projections are practical notes, not measured 15- or 50-replay runs.

## Blockers Or Open Risks

- Expansion to 15 replays should review storage/cache strategy before committing full package material at scale.
- New replays must be canonicalized before inclusion in future factual audits.

## Readiness Assessment

Ready as bounded factual foundation: true.
What is ready: Five human replay statuses are represented with accepted gate sources. Factual categories, schema compatibility, provenance status, performance availability, and storage representation are explicit. The pilot is suitable for a human milestone decision about scaling factual processing.
What is not ready: Full corpus generalization is not established. Spatial semantics, mechanics, fights, rotations, pressure, macro, roles, and decision-quality analysis remain unavailable. Replay 002 category-level package counts are not reemitted by the v9 terminal audit artifacts. Replay 009 timing is not comparable from current artifacts.
Expansion blockers: Storage/cache policy should be reviewed because full package material and historical outputs can be large. Batch processing should preserve compact manifests or a cache strategy before scaling. Any new replay with missing accepted gate evidence should block inclusion until canonicalized.
Next human milestone decision options: expand factual batch to 15 replays; improve storage/cache pipeline before scaling; revisit spatial evidence only if genuinely new evidence exists; improve mechanics/build mapping; build local AI/runtime benchmark later.

Task 097 was not created.
Process stops here for a human milestone decision.
