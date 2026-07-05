# Factual Batch 15 Human Expansion

## Frozen Acceptance Matrix

| Requirement | Classification |
| --- | --- |
| Inventory currently available replay candidates. | required |
| Exclude protected and unsupported replays. | required |
| Reuse accepted five-replay pilot outputs. | required |
| Canonicalize additional eligible human replays only when required generated artifacts already exist. | required |
| Use compact manifests in Git. | required |
| Avoid full package commits by default. | required |
| Record why the target of 15 was or was not reached. | required |
| Do not process raw replay files. | required |
| Do not create Task 099. | required |
| Spatial, mechanics, fights, rotations, pressure, macro, role, ML, or decision-quality outputs. | explicit_non_goal |
| Raw replay parsing to force success. | explicit_non_goal |
| Blocked gate when fewer than 15 eligible generated human replay entries exist. | accepted_limitation |

Gate: `factual_batch_15_expansion_blocked`

Target batch size: 15
Total included count: 5
15 reached: false
More eligible replays needed: 10
Accepted existing pilot replays: replay_001, replay_002, replay_003, replay_004, replay_009
Newly eligible replays: none
Ineligible candidates: replay_005=protected_replay_excluded; replay_006=unsupported_bot_fixture_excluded

## Included Replays

- `replay_001`: schema_identical; source `output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json`.
- `replay_002`: accepted_by_terminal_validation; source `output/replay-002-canonical-v9-validation/terminal-release-verification.json`.
- `replay_003`: schema_identical; source `output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json`.
- `replay_004`: schema_identical; source `output/five-replay-pilot/remaining-human-controls/canonicalization-gate.json`.
- `replay_009`: accepted_with_constraints; source `output/replay-009-canonical/canonical-state-gate.json`.

## Storage Policy

Task 098 commits compact reference manifests only. Full package dumps are not committed by default.

## Protection Audit

Replay 005 was excluded and untouched. Bot fixtures 006-008 were not processed. Raw replay parsing did not run. Task 099 was not created.

## Branch Audit

Replay-specific branch audit: passed with 0 findings.

## Accepted Limitations

- The repository currently exposes fewer than 15 eligible generated human replay entries.
- Expansion cannot proceed without additional generated human replay artifacts or explicit raw replay processing authorization in a future task.
