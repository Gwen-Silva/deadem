# Task 201 — Build Whole-Match Visual Index

Status: completed

Coordination status: `VALIDATING` pending independent ChatGPT Work acceptance.

Base: `0ed554433cf4c8b0f0ad33b13a05354a7a843add`

## Functional result

Built a deterministic coarse visual index for both accepted review targets by
consuming the Task 200 mapping without recalculation. The gate claim is
`whole_match_visual_index_ready`.

## Observable result

- Sampling interval: 30 replay-elapsed seconds.
- `review_match_001`: 153/153 frames, replay samples 0-4560, VOD 1938-6498,
  9-second alignment error retained, seek error average/max 0/0 ms, 7 sheets.
- `review_match_002`: 70/70 frames, replay samples 0-2070, VOD 0-2070,
  2-second alignment error retained, seek error average/max 0/0 ms, 3 sheets.
- Overall: 223/223 extracted, zero failures and 100% planned extraction.
- Representative rerun: 20/20 requested times, decoded times and frame hashes
  matched.
- Contact sheets: 10/10 byte-deterministic across two builds.
- Compact artifacts: 7/7 byte-identical across a full rerun.
- Focused tests: 21/21 passed.

## Boundaries

Replay seconds 4563-4570 and 2091-2093 remain unavailable and were never
sampled. Frame and contact-sheet images remain local under
`.local/deadem/visual-index/`. No replay 005-008 access, heavy image versioning,
gameplay interpretation, final fact or attribution occurred.

Final acceptance remains pending independent ChatGPT Work validation. No Task
202 was created.
