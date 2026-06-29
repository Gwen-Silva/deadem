# Match 91119257 Human Visual Review Final

Date: 2026-06-29

## Scope

Task 042 ingested the completed human review for the 24 dense manual-review annotations. It preserved source annotation intervals separately from representative visual evidence, did not process replay 005, did not install optional video dependencies, and did not resume parser recovery or video-demo alignment.

## Results

- Review records ingested: 24
- Confirmed records: 22
- Partially confirmed records: 1
- Conflict records: 1
- Final gate: `human_visual_review_ready_with_unresolved_timing`

## Timing

- Median offset: 7500.0 ms
- P90 offset: 10000 ms
- Maximum offset: 13500 ms
- More than +5 seconds: E001, E002, E003, E004, E006, E009, E013, E014, E021, E028, E029, E030, E031, E032, E050, E060, E077, E081, E083, E084, E085, E086, E087, E088
- More than +10 seconds: E009
- Negative-offset useful frames: E030

The observed positive delay is a property of this annotation workflow and recording, not a universal timing rule.

## Alias Evidence

- Hidden King allied base: `human_visually_confirmed`
- Archmother enemy base: `human_visually_confirmed`
- Yellow lane left side of Hidden King base: `human_visually_confirmed`
- Green lane right side of Hidden King base: `human_visually_confirmed`
- Archmother Green-lane Shrine position: `human_visually_confirmed`
- Archmother Yellow-lane Shrine position: `human_visually_confirmed`
- enemy minimap display red: `previous_task_only`

## Unresolved

- E032: exact respawn frame remains unresolved.
- E084: specific green buff effect remains unresolved.
- E088: Teleporter element identity is confirmed, but timestamp/source-record mapping remains unresolved.
- E005: source row exists, but it was not selected for the 24-case task 038 minimized review set and is not added as a 25th reviewed case.

## Outputs

- `output/match_91119257/manual-review-human-responses.json`
- `output/match_91119257/manual-review-human-responses.csv`
- `output/match_91119257/manual-review-form-v2-completed.json`
- `output/match_91119257/manual-review-form-v2-completed.csv`
- `output/match_91119257/human-validated-visual-landmarks.json`
- `output/match_91119257/human-review-unresolved-items.json`
- `output/match_91119257/representative-visual-intervals.json`
- `output/match_91119257/human-review-alias-evidence.json`
- `output/match_91119257/human-review-final-gate.json`
