# Match 91119257 Minimized Manual Review Instructions

This package contains 24 selected review cases from the 88 annotation groups. It is intentionally minimized: cases that were already sufficiently visible for the current evidence layer are not included.

## What To Review

Use `output/match_91119257/manual-review-form.csv` if you prefer a spreadsheet, or `output/match_91119257/manual-review-form.json` if you prefer structured JSON.

For each question, choose one response:

- `confirmed`: the visible frames independently support the current assessment.
- `corrected`: the current assessment needs a structured correction.
- `still_ambiguous`: multiple plausible interpretations remain.
- `not_visible`: the requested visual feature is not visible.
- `not_enough_context`: the frame is visible, but the context is insufficient.

For `corrected`, fill the relevant correction fields only:

- `corrected_element_type`
- `corrected_map_side`
- `corrected_lane_color`
- `corrected_element_team`
- `notes`

## Important Rules

- Do not mark a case confirmed only because the CSV label says so.
- Do not infer macro, rotations, fights, strategic intent, or semantic occupancy.
- Do not replace neutral structural IDs from this review alone.
- E088 should be reviewed as a timestamp/window question; the source CSV row remains preserved.

## Local Images

The extracted frames and review sheet are local and untracked. Main local review sheet:

`output-local/match_91119257/annotation-visibility-review/minimized_visibility_review.jpg`

Frame paths for each case are listed in both the JSON and CSV forms.

## Replay 005

Replay 005 was not processed.
