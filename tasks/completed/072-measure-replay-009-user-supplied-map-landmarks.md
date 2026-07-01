# Task 072: Measure Replay 009 User-Supplied Map Landmarks

Status: completed

Execution mode: autonomous

## Context

Task 071 completed correctly with gate `replay_009_independent_landmark_coordinates_missing` because the five user-supplied replay-009 map/minimap images were not locally available at execution time.

The images have now been placed under:

```text
.local/spatial-inputs/replay-009-user-maps/
```

Task 071 must not be reopened or rewritten. This task is a narrow follow-up that inventories, classifies, and measures the newly available images as human-supplied visual evidence.

## Objective

Inventory, classify, and measure landmarks from the newly available replay-009 user-supplied images.

Use the images only as human-supplied visual evidence. Do not fit a world-to-map transform unless every independent-anchor and held-out-validation prerequisite is satisfied. This task is expected to stop before fitting and produce measurement inputs for a later transform-validation continuation.

## Constraints

- Do not emit lanes or regions.
- Do not calculate objective proximity.
- Do not infer rotations, pressure, fights, or macro interpretation.
- Do not treat the modded minimap as authoritative geometry.
- Do not treat human annotations as independent proof.
- Do not commit the user images, screenshots, crops, or frames.
- Do not process replay 005.
- Do not process replays 006-008.
- Do not apply mechanic effects.
- Keep image files local and untracked.

## Inputs

Expected local directory:

```text
.local/spatial-inputs/replay-009-user-maps/
```

Likely filenames:

- `01-modded-map-full-overlay.jpg`
- `02-modded-map-reduced-overlay.jpg`
- `03-modded-map-landmarks.jpg`
- `04-standard-replay-minimap.jpg`
- `05-urn-spawn-location-diagram.png`

Do not assume filenames. Inventory all supported `.png`, `.jpg`, `.jpeg`, and `.webp` files in the directory.

## Source Roles

Classify each image as one of:

- `replay_observed_standard_minimap`
- `user_modded_minimap`
- `derived_landmark_map`
- `mechanic_spawn_diagram`
- `unknown`

Expected interpretation:

- The standard replay minimap is direct visual evidence from replay 009.
- The modded maps are derived visual aids and must not be treated as official game assets.
- The Urn diagram documents spawn logic/locations and is not a primary world-to-map calibration surface.

## Required Work

1. Create `output/replay-009-landmark-measurement/image-inventory.json` with relative path, filename, SHA-256, dimensions, format, source role, direct/derived status, believed replay/build relationship, coordinate origin convention, orientation, cropping, scaling, modification status, calibration suitability, and limitations.
2. Record participant orientation assertions separately in `orientation-annotations.json` as advisory human annotations, not transform validation.
3. Use top-left pixel origin, x increasing rightward, y increasing downward, raw pixels plus normalized `[0,1]`, symbol-center measurements, and explicit uncertainty radius in pixels.
4. Measure visible fixed landmarks where supportable: Mid Boss, three Sapphire Walkers, three Amber Walkers, three Sapphire Guardians, three Amber Guardians, Sapphire/Amber Patron, shrines, base guardians, and stable zipline convergence points if unambiguous.
5. Do not measure player icons, temporary unit icons, boxes, golden statues, Urn spawn markers as transform anchors, ambiguous Patron phases, or objects identified only by colored overlay dots.
6. Determine whether the minimap-like images share crop, scale, center, orientation, aspect ratio, and underlying geometry. Use stable visual landmarks, not dimensions alone.
7. Classify replay-landmark correspondence candidates. Preferred candidates are Mid Boss and six Walkers; Guardians only where class/team/lane identity can be grounded; fixed base structures only if internal-class identity is not required.
8. Pre-register a fit/validation anchor plan before any residual calculation. Reserve at least one distributed landmark as validation-only where possible. Do not fit a transform in this task unless all prerequisites are met.
9. If Task 070 already completed as not ready, create one blocked rerun/continuation task for transform validation using the new measured coordinates. Do not rewrite Task 070's historical result.

## Required Outputs

- `output/replay-009-landmark-measurement/image-inventory.json`
- `output/replay-009-landmark-measurement/image-role-classification.json`
- `output/replay-009-landmark-measurement/orientation-annotations.json`
- `output/replay-009-landmark-measurement/measured-landmarks.json`
- `output/replay-009-landmark-measurement/cross-image-registration.json`
- `output/replay-009-landmark-measurement/replay-landmark-correspondence-candidates.json`
- `output/replay-009-landmark-measurement/fit-validation-anchor-plan.json`
- `output/replay-009-landmark-measurement/measurement-summary.json`
- `output/replay-009-landmark-measurement/measurement-gate.json`
- `output/replay-009-landmark-measurement/README.md`
- `reports/replay-009-user-map-landmark-measurement.md`

## Gate

Produce exactly one:

- `replay_009_independent_landmark_coordinates_ready`
- `replay_009_independent_landmark_coordinates_ready_with_limitations`
- `replay_009_independent_landmark_coordinates_insufficient`
- `replay_009_independent_landmark_coordinates_blocked`

Use `ready` only when image roles are known, pixel coordinates are measured, standard/modded registration is established where needed, enough independently identified landmarks exist, a held-out validation set is reserved, and replay-side pairing is identity-grounded.

## Validation

Run:

- image inventory tests;
- hash tests;
- dimension tests;
- coordinate bounds tests;
- normalized-coordinate tests;
- image-role tests;
- cross-image registration tests;
- landmark identity tests;
- fit/validation split tests;
- no-transform tests;
- no-lane/no-region tests;
- mechanic-effect-zero tests;
- JSON validation;
- deterministic rerun;
- task queue validation;
- Markdown links;
- ESLint where applicable;
- Git status validation.

## Git

Commit only compact measurements, hashes and metadata, correspondence candidates, tests, reports, documentation, and task files.

Do not commit the five images.

Create one commit and push to `origin/main`.
