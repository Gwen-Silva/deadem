# Match 91119257 Annotation Frame Visibility

Date: 2026-06-28

## Scope

Task 038 reviewed the 88 annotation frame groups produced by task 037. This is a visibility and evidence audit only. It did not install OCR, detection, VLM, tracking, or parser-recovery dependencies, and it did not process replay 005.

## Visibility Summary

- Usable frame groups: 88 / 88
- Clock visible: 88 / 88
- Clock manually legible: 88 / 88
- Minimap visible/usable: 88 / 88
- Lane color visible: 77 yes, 7 partial
- Target visible: 83 yes, 5 partial
- Target type distinguishable: 38 yes, 50 partial
- Target team distinguishable: 34 yes, 26 partial
- Landmark context visible: 88 yes, 0 partial

## Support Classes

- Directly visible: 37
- Visually probable: 46
- Ambiguous: 5
- User annotation only: 0
- Contradicted: 0

## OCR Feasibility

OCR is justified only for controlled game-clock ROI validation, not broad HUD interpretation.

The game clock ROI is the only recommended OCR target for the next controlled task. Player/structure names, health values, and broad HUD labels remain too variable for immediate OCR without manual ROI triage.

## E088

Result: `corrected_visually_supported`. The original source row is preserved. The corrected 24:50-24:55 window is visually supported relative to the duplicated original 23:50-23:55 window, but this does not validate demo alignment.

## Alias Feasibility

Enemy minimap red display is directly supported as display-color evidence. Archmother/Hidden King side aliases and Green/Blue/Yellow lane continuity are only partially supported and require manual confirmation before alias promotion.

## Manual Review

Minimized review count: 24. The review packet includes ambiguous/resource identity cases, side/lane alias-critical examples, and E088. It does not request broad review of all 88 annotations.

## Gate

`annotation_visibility_requires_manual_review`

## Outputs

- `output/match_91119257/annotation-visibility-audit.json`
- `output/match_91119257/annotation-visibility-summary.json`
- `output/match_91119257/ocr-feasibility.json`
- `output/match_91119257/video-roi-proposals.json`
- `output/match_91119257/e088-visual-review.json`
- `output/match_91119257/visual-alias-feasibility.json`
- `output/match_91119257/minimized-manual-review.json`
- `output/match_91119257/annotation-visibility-gate.json`
