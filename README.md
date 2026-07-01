# Deadem Replay Analysis

This repository is an independent Deadlock replay-analysis and knowledge
pipeline built on top of the open-source
[`deadem`](https://github.com/Igor-Losev/deadem) Source 2 replay parser.

The project separates:

```text
raw replay parsing
-> telemetry validation
-> spatial/state reconstruction
-> versioned mechanics knowledge
-> bounded analytical interpretation
```

Strategic, macro, fight-quality, rotation, and decision-quality interpretation
is not implemented yet.

## Project Purpose

The current goal is to produce reproducible, evidence-bounded datasets from
Deadlock replays while keeping low-level observations separate from
patch-sensitive game mechanics and later interpretation.

The repository currently supports structural replay inspection, constrained
gameplay telemetry validation, non-spatial factual state detection, and a
versioned mechanics knowledge layer. It does not assume that the current game
rules apply to historical replays.

## Current Validated Capabilities

- Normal human replay parsing for fixtures 001-004 and 009.
- Structural replay completion checks independent of gameplay-state
  materialization.
- Player and team discovery for replay 009: 12 players, 6v6.
- Controller-to-pawn continuity with one-second sampling limitations.
- One-second player trajectory telemetry for replay 009 with complete coordinate
  presence.
- Death-counter and lifecycle consistency for replay 009: 84 matched deaths.
- `m_iGoldNetWorth` player/team endpoint summaries from replay 009.
- Non-spatial factual-state detection from Task 060:
  - player life/death/respawn parser-time events;
  - 84 deaths, 82 observed respawn returns, 2 deaths unresolved before replay end;
- Objective/structure observability from Task 062:
  - Mid Boss and core structure classes/properties are directly observable with
    constraints;
  - Spirit Urn and Rejuvenator remain partial/uncertain;
  - no objective completion, claim, deposit, kill, or effect is inferred.
- Objective/structure factual events from Task 063:
  - Mid Boss, Guardian, Walker, and Patron/base entity lifecycle plus sampled
    raw health/team/state events are emitted with semantic limits;
  - health zero and entity deletion remain observations, not kill/destruction or
    objective-completion conclusions.
- Independent visual validation from Task 064:
  - replay-009 video provides independent rendering-path support with gaps;
  - Mid Boss events receive the strongest support, Walker events are supported
    with constraints, Patron/base identity remains ambiguous, Guardian was not
    visible in the sample, and Urn/Rejuvenator remain unresolved;
  - mechanic effects, kills, destruction, claims, deposits, and strategic
    interpretations remain unapplied.
- Canonical replay-009 factual state from Task 065:
  - player, life/death/respawn, net-worth, objective/structure raw events,
    entity registry, snapshots, and Task 064 validation overlays are normalized
    into one provenance-preserving layer;
  - canonical does not mean independently validated, and category-level visual
    validation does not validate every event.
- Local factual-state inspector from Task 066:
  - static HTML/CSS/JavaScript over `output/replay-009-inspection/`;
  - filterable timeline, snapshots, player/entity inspectors, validation
    overlays, non-timeline metadata, and provenance panels;
  - exportable factual Markdown reports with semantic limits preserved.
- Inspector workflow evaluation from Task 067:
  - 12 scripted review workflows evaluated;
  - CLI/interface/export parity validated with timeline-only filters;
  - evaluation is automated plus single-reviewer technical inspection, not
    broad user research;
  - remaining medium limitations are single-reviewer scope and careful
    Patron/base class reading.
- Versioned mechanic schemas and conservative query behavior for ambiguous
  builds.

## Current Limitations

- Replay 005 remains protected as the final holdout.
- Solo-bot fixtures 006-008 are unsupported by gameplay-state reconstruction.
- Build `23916427` has no confirmed patch mapping.
- Active-game-time and explicit pause intervals are unavailable.
- Map transform and map-version compatibility are unresolved for replay 009.
- Generic regions, lane projection, objective proximity, and spatial semantic
  states are unavailable.
- Objective/structure factual events have only partial independent visual
  support; destruction, kill, claim, deposit, or secure conclusions remain
  prohibited.
- Mechanic activation and mechanic effects are not applied.
- Net worth does not expose secured, unsecured, spendable, or reward-source
  economy semantics.
- Macro decision analysis is not ready.

## Corpus Status

| Fixture | Status |
| --- | --- |
| 001-004 | Compatible normal replay controls. |
| 005 | Protected final holdout. Do not process without explicit final-holdout authorization. |
| 006-008 | Unsupported solo-bot fixtures with distinct state-reconstruction failures. |
| 009 | Primary validated normal replay for telemetry and non-spatial factual states. |

Replays 001-004 are parser-compatible controls. They should not be described as
fully telemetry-validated unless a specific report establishes that stronger
claim.

## Pipeline Status

```text
Replay bytes
  -> structural parsing                     [available]
  -> gameplay telemetry                     [available with constraints]
  -> player identity/lifecycle              [available with constraints]
  -> factual non-spatial state detection    [replay_009_factual_state_detection_ready_with_gaps]
  -> canonical factual state schema         [replay_009_canonical_factual_state_ready_with_constraints]
  -> spatial map projection                 [not available]
  -> mechanic version resolution            [unresolved for build 23916427]
  -> mechanic activation                    [blocked]
  -> analytical interpretation              [blocked]
```

## Current Direction

The next defined milestone is the **spatial foundation**: acquire or validate
map geometry, coordinate anchors, map bounds, regions, lanes, and
objective/structure positions before attempting objective proximity, movement
paths, rotations, map pressure, or macro context.

Task 069 acquired limited spatial-foundation inputs: local installed map-package
metadata, external/reference metadata, and replay-derived landmark candidates.
It did not validate build compatibility, extract an authoritative map, fit a
transform, or enable regions/lanes/proximity. This milestone therefore remains
open until independent map coordinates and compatibility evidence are validated.
Task 070 inspected the local-only preferred package candidate and indexed
spatially relevant resources, but it still found zero coordinate-bearing
landmarks and fitted no transform.
Task 071 ingested a participant annotation packet for replay 009, but the five
referenced map/minimap images were not present locally at that time. Task 072
then measured the newly supplied local images as human-supplied visual evidence:
the standard replay minimap, modded/reference maps, and Urn diagram are
inventoried with hashes and bounded pixel landmark coordinates. This creates
inputs for a future transform-validation retry, but no transform, region, lane,
proximity, or mechanic effect is validated yet.
Task 073 and Task 074 then showed that the committed compact replay-009
objective/structure path did not preserve replay-side fixed-entity coordinates.
Task 075 narrowed that gap: a bounded parser diagnosis recovers
`CBodyComponent.m_vecX/Y/Z` and `m_cellX/Y/Z` coordinate-like fields for
Walker-class target entities, so the missing layer is compact-filter omission
with unresolved target coverage and identity.
Task 076 then built a bounded fixed-entity coordinate layer: it preserves all
eight target generations, resolves vector-only replay coordinates for two late
Walker generations, preserves raw team IDs for all six Walkers, and keeps named
teams, lanes, fit correspondences, regions, proximity, and transform fitting
blocked.
Task 077 then attempted identity-only Walker resolution and kept the transform
blocked: raw team IDs remain unmapped to named teams, participant/video evidence
is only class/set-level, and no individual Walker handle is linked to a named
map landmark before residual inspection.
See [`docs/NEXT_MILESTONE.md`](./docs/NEXT_MILESTONE.md).

## Knowledge Layer

Versioned mechanics records live in [`knowledge/`](./knowledge). Current pilot
mechanics are:

- Spirit/Soul Urn
- Mid Boss
- Rejuvenator
- Souls/economy
- Death/respawn
- Core structures

The Deadlock Wiki is treated as a maintained secondary source, not as automatic
ground truth for historical builds. Current rules are not silently applied to
unmapped builds. When build mapping is ambiguous, queries return ambiguity and
apply no effects.

Telemetry state and mechanic interpretation remain separate. Observing a state
does not prove that a patch-sensitive mechanic effect was active.

## Important Epistemic Rules

- Parser completion does not prove telemetry correctness.
- Valid coordinates do not prove valid map projection.
- Entity disappearance does not prove objective completion.
- Net worth does not expose secured, unsecured, or spendable souls.
- Observed state does not prove a mechanic effect was active.
- A favorable result does not prove a decision was correct.

## Repository Navigation

- Current project state: [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md)
- Repository guide: [`docs/REPOSITORY_GUIDE.md`](./docs/REPOSITORY_GUIDE.md)
- Next milestone: [`docs/NEXT_MILESTONE.md`](./docs/NEXT_MILESTONE.md)
- Report index: [`reports/INDEX.md`](./reports/INDEX.md)
- Mechanics knowledge: [`knowledge/README.md`](./knowledge/README.md)
- Output conventions: [`output/README.md`](./output/README.md)
- Task queue and history: [`tasks/`](./tasks)

Major current reports:

- [`reports/replay-009-end-to-end-telemetry-validation.md`](./reports/replay-009-end-to-end-telemetry-validation.md)
- [`reports/replay-009-pause-clock-observability.md`](./reports/replay-009-pause-clock-observability.md)
- [`reports/replay-009-spatial-geometric-projection-validation.md`](./reports/replay-009-spatial-geometric-projection-validation.md)
- [`reports/versioned-mechanics-knowledge-foundation.md`](./reports/versioned-mechanics-knowledge-foundation.md)
- [`reports/build-23916427-mechanics-mapping.md`](./reports/build-23916427-mechanics-mapping.md)
- [`reports/replay-009-factual-state-detection.md`](./reports/replay-009-factual-state-detection.md)
- [`reports/replay-009-objective-structure-entity-observability.md`](./reports/replay-009-objective-structure-entity-observability.md)
- [`reports/replay-009-objective-structure-factual-state-events.md`](./reports/replay-009-objective-structure-factual-state-events.md)
- [`reports/replay-009-objective-structure-independent-validation.md`](./reports/replay-009-objective-structure-independent-validation.md)
- [`reports/replay-009-canonical-factual-state-schema.md`](./reports/replay-009-canonical-factual-state-schema.md)
- [`reports/replay-009-factual-state-inspection-interface.md`](./reports/replay-009-factual-state-inspection-interface.md)
- [`reports/replay-009-inspector-workflow-evaluation.md`](./reports/replay-009-inspector-workflow-evaluation.md)
- [`reports/deadem-next-milestone-decision.md`](./reports/deadem-next-milestone-decision.md)
- [`reports/replay-009-map-geometry-input-acquisition.md`](./reports/replay-009-map-geometry-input-acquisition.md)
- [`reports/replay-009-candidate-world-to-map-transform-validation.md`](./reports/replay-009-candidate-world-to-map-transform-validation.md)
- [`reports/replay-009-human-annotation-packet.md`](./reports/replay-009-human-annotation-packet.md)
- [`reports/replay-009-independent-landmark-coordinate-acquisition.md`](./reports/replay-009-independent-landmark-coordinate-acquisition.md)
- [`reports/replay-009-user-map-landmark-measurement.md`](./reports/replay-009-user-map-landmark-measurement.md)
- [`reports/replay-009-transform-validation-retry.md`](./reports/replay-009-transform-validation-retry.md)
- [`reports/replay-009-walker-identity-fixed-coordinate-resolution.md`](./reports/replay-009-walker-identity-fixed-coordinate-resolution.md)
- [`reports/replay-009-fixed-entity-spatial-property-diagnosis.md`](./reports/replay-009-fixed-entity-spatial-property-diagnosis.md)
- [`reports/replay-009-fixed-entity-coordinate-resolution.md`](./reports/replay-009-fixed-entity-coordinate-resolution.md)
- [`reports/replay-009-walker-identity-resolution.md`](./reports/replay-009-walker-identity-resolution.md)

## Running Validation

Install workspace dependencies with:

```bash
npm install
```

Supported validation commands:

```bash
npm test
npm run lint
npm run validate:tasks
npm run check:outputs
node --test tests/knowledge/query-mechanics.test.mjs
node --test tests/replay-009-factual-state-detection.test.mjs
node --test tests/replay-009-spatial-validation.test.mjs
node --test tests/canonical-replay-state/*.test.mjs
node --test tests/replay-009-inspector.test.mjs
node --test tests/replay-009-inspection-evaluation.test.mjs
node -e "const fs=require('fs'); for (const f of fs.readdirSync('output/replay-009-states')) { const p='output/replay-009-states/'+f; const t=fs.readFileSync(p,'utf8').trim(); if (f.endsWith('.json')) JSON.parse(t); if (f.endsWith('.jsonl') && t) for (const line of t.split(/\r?\n/)) JSON.parse(line); }"
```

Generate and serve the replay-009 inspector:

```bash
node tools/generate-replay-inspection-report.mjs --replay replay_009
node tools/serve-replay-inspector.mjs --dir output/replay-009-inspection
node tools/evaluate-replay-inspector-workflows.mjs
```

Export a factual report:

```bash
node tools/export-replay-factual-report.mjs --replay replay_009 --mechanic mid_boss --output reports/generated/replay-009-mid-boss-factual-report.md
```

Video-pipeline tests use the isolated Python environment when available:

```powershell
.\.venv-video\Scripts\python.exe -m pytest tests\video_pipeline -q
```

`npm run check:outputs` may continue to report the pre-existing oversized
`output/04-controller-pawn-lifecycle.json`; that warning is unrelated to the
current replay-009 state layer.

## Upstream Attribution

This repository depends on and retains attribution to the upstream
[`Igor-Losev/deadem`](https://github.com/Igor-Losev/deadem) project and its
Source 2 replay parsing packages:

- [`@deademx/engine`](./packages/engine)
- [`deadem`](./packages/deadem)
- [`@deademx/cs2`](./packages/cs2)
- [`@deademx/dota2`](./packages/dota2)

Inherited parser/package code remains the work of the original authors and
contributors.

## License

This repository retains the [MIT License](./LICENSE) from the upstream project.
