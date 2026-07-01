# Repository Guide

This repository keeps source code, task history, compact evidence, reports, and generated structured outputs together. Use this guide to distinguish current canonical files from historical evidence.

## Source Code

- Node parser and engine code: `packages/engine/`
- Deadlock package code: `packages/deadem/`
- Video pipeline Python package: `python/deadem/video_pipeline/`
- Utility and experiment scripts: `scripts/` and `experiments/`
- Tests: `packages/*/tests/` and `tests/video_pipeline/`

## Project State

- Current narrative state: `docs/PROJECT_STATE.md`
- Queue rules: `AGENTS.md`, `docs/WORKFLOW.md`, `docs/CODEX_QUEUE_RUNNER.md`
- Parser failure catalog: `docs/PARSER_FAILURE_CATALOG.md`

## Evidence And Outputs

Tracked compact evidence lives under `output/`. Files there may be canonical, diagnostic, historical, or regenerable. See `output/README.md` and `output/repository-audit/canonical-file-map.json`.

Current canonical topics include:

- project_state: `docs/PROJECT_STATE.md`
- latest_report_pointer: `reports/latest.md`
- replay_manifest: `data/replay-manifest.json`
- completed_human_review: `output/match_91119257/manual-review-form-v2-completed.json`
- alias_evidence: `output/match_91119257/canonical-map-aliases.json`
- representative_visual_intervals: `output/match_91119257/annotation-visibility-audit.json`
- parser_failure_state: `output/parser-compatibility/parser-compatibility-gate.json`
- entity_5594_investigation: `output/match_91119257/parser-recovery-gate.json`
- baseline_709_investigation: `output/match_91119257/baseline-709-gate.json`
- current_parser_gate: `output/parser-compatibility/parser-compatibility-gate.json`

## Mechanics Knowledge

Versioned mechanics records live under `knowledge/`. Start with
`knowledge/README.md`, then inspect pilot packages under `knowledge/mechanics/`.
Mechanics knowledge is separate from replay telemetry and must not be used to
infer macro decisions or current-rule applicability for historical builds.

Use `tools/query-mechanics.mjs` to query build/patch applicability. Build
`23916427` is currently recorded as unresolved with a date-supported candidate
patch state in `knowledge/patches/build-patch-mapping.json`. The detailed
mapping audit is `reports/build-23916427-mechanics-mapping.md`.

## Reports

- Current report pointer: `reports/latest.md`
- Human report index: `reports/INDEX.md`
- Reports are historical records unless a task states otherwise.

## Task History

- Completed task index: `tasks/completed/INDEX.md`
- Executable queue: `tasks/pending/`
- Blocked work: `tasks/blocked/`
- Future ideas: `tasks/backlog/`

## Local-Only Directories

`output-local/`, virtual environments, frame dumps, contact sheets, caches, model weights, MP4 files, and DEM files should remain local unless a future task explicitly permits a compact manifest.

## Match 91119257

Start with `docs/PROJECT_STATE.md`, then read current reports under `reports/INDEX.md` in the visual calibration, human review, and parser recovery groups. Use neutral IDs unless a canonical alias file explicitly records packet-scoped provenance.

## Canonical Versus Historical

Canonical files are current inputs or decisions. Historical files preserve provenance and should not be deleted merely because a newer file exists. Superseded files may be archived only after the cleanup proposal is explicitly approved.

Audit metrics: 1204 tracked files, 612 tracked output files, 44 reports.

## Cleanup Navigation

The conservative cleanup cycle keeps canonical match 91119257 files visible and moves approved historical predecessors to `output/archive/match_91119257/`. Start at `output/match_91119257/README.md` for match-specific navigation.

## Structural Replay Parsing

Use `inspectReplayStructure` or `scripts/inspect-replay-structure.js` for metadata/envelope inspection that does not materialize gameplay state. Structural parser outputs live under `output/parser-compatibility/` and do not approve semantic telemetry.

## Replay Corpus Status

- Compatible normal fixtures for parser work: replay 001, replay 002, replay 003, replay 004, and replay 009.
- Unsupported solo-bot fixtures: replay 006, replay 007, and replay 008. Preserve these as parser-incompatibility fixtures unless a task explicitly targets them.
- Protected final holdout: replay 005. Do not process it outside an explicitly authorized final-holdout task.
- Replay 009 telemetry validation outputs live in `output/replay-009-validation/`.
- Replay 009 spatial/geometric validation outputs live in `output/replay-009-spatial/`.
  This layer currently validates player coordinates only with constraints; it
  does not validate region, lane, objective, structure, or proximity projection.
- Replay 009 factual state outputs live in `output/replay-009-states/`. Task
  060 currently contains only partial non-spatial observed states: player
  life/death/respawn events, `m_iGoldNetWorth` endpoint summaries, and
  mechanics ambiguity queries. It applies zero mechanic effects and emits no
  region, lane, objective proximity, or structure-region results.
  Task 062 adds direct non-spatial objective/structure observability for replay
  009. Mid Boss and core structure classes/properties are usable with
  constraints; Spirit Urn and Rejuvenator remain partial/uncertain. These
  outputs still do not apply mechanic effects or spatial interpretation.
  Task 064 compares a bounded Task 063 event sample against
  `samples/videos/replay_009_independent_validation.mp4.mp4`. The video supports
  some objective/structure events through an independent rendering path, with
  Mid Boss strongest, Walker constrained, Patron/base ambiguous, Guardian not
  visible in the sample, and Urn/Rejuvenator unresolved. It still does not
  approve destruction, kill, claim, deposit, secure, mechanic effect, or macro
  conclusions.
- Replay 009 canonical factual state outputs live in
  `output/replay-009-canonical/`. Task 065 normalizes player, life/death,
  respawn, net-worth, objective/structure raw events, entity generations,
  snapshots, and Task 064 validation overlays into one queryable layer.
  Canonical does not mean independently validated: visual validation is
  event-level only, category validation is not propagated to every event, camera
  absence is not entity absence, and visual timing keeps bounded uncertainty.
  Use `tools/query-replay-state.mjs` for deterministic inspection.
- Replay 009 inspection interface outputs live in
  `output/replay-009-inspection/`. Regenerate them with
  `node tools/generate-replay-inspection-report.mjs --replay replay_009` and
  serve locally with
  `node tools/serve-replay-inspector.mjs --dir output/replay-009-inspection`.
  Export bounded factual Markdown reports with
  `tools/export-replay-factual-report.mjs`. Use `--timeline-only` when matching
  CLI/export counts to the inspector timeline, because non-timeline metadata is
  intentionally separate. The inspector shows factual and
  candidate observations, provenance, validation labels, and semantic limits;
  it does not perform strategic or macro analysis.
- Replay 009 inspector workflow-evaluation outputs live in
  `output/replay-009-inspection-evaluation/`. Reproduce them with
  `node tools/evaluate-replay-inspector-workflows.mjs`. The evaluation is
  automated plus single-reviewer technical inspection, not broad usability
  research.
- The next milestone decision lives in `docs/NEXT_MILESTONE.md` and
  `output/project-milestone-analysis/`. Task 068 selects spatial foundation
  first, but execution is blocked on authoritative or calibratable map geometry
  and independent coordinate anchors. Do not begin objective proximity, lane
  projection, rotations, map pressure, or macro work from current coordinates
  alone.
- Replay 009 spatial input acquisition outputs live in
  `output/replay-009-spatial-inputs/`. Task 069 records local installed map
  package metadata, external/reference metadata, geometry candidates, candidate
  anchors, licensing constraints, and transform-feasibility limits. These
  outputs do not fit a transform and do not validate regions, lanes, objective
  proximity, or map compatibility for build `23916427`.
- Replay 009 candidate transform validation outputs live in
  `output/replay-009-transform-validation/`. Task 070 records local asset access,
  bounded VPK/package-index resource metadata, extraction-tool inventory,
  landmark-candidate rejection, model preregistration, and the transform gate.
  No transform is fitted because independent map-side landmark coordinates and
  held-out validation anchors are missing.
- Replay 009 human annotation outputs live in
  `output/replay-009-human-annotations/`, and independent landmark acquisition
  outputs live in `output/replay-009-independent-landmarks/`. Task 071 records
  the participant packet as advisory evidence. The referenced map/minimap images
  were not locally accessible during Task 071, so that task produced no
  coordinate-bearing landmark set.
- Replay 009 user-map landmark measurements live in
  `output/replay-009-landmark-measurement/`. Task 072 measures the later
  supplied local images as human-supplied visual evidence and preregisters a
  future transform fit/validation anchor split. These outputs are not a fitted
  transform and do not authorize regions, lanes, objective proximity, or
  mechanic effects.
- Replay 009 transform retry outputs live in
  `output/replay-009-transform-retry/`. Task 073 uses the measured map-image
  landmarks but stops before fitting because replay fixed-entity world
  coordinates and pre-residual Walker pairings remain unavailable. Do not use
  permutation search, nearest projected points, or training residuals to fill
  this gap.
- Replay 009 fixed-entity resolution outputs live in
  `output/replay-009-fixed-entity-resolution/`. Task 074 confirms that the
  committed compact path does not expose usable `CNPC_MidBoss` or
  `CNPC_Boss_Tier2` world coordinates and does not resolve Walker team/lane
  identity. The next layer is a narrow parser spatial-property extraction
  diagnosis, not transform fitting.
- Replay 009 fixed spatial-property diagnosis outputs live in
  `output/replay-009-fixed-spatial-diagnosis/`. Task 075 shows that bounded
  parser-level evidence does expose `CBodyComponent.m_vecX/Y/Z` and
  `CBodyComponent.m_cellX/Y/Z` coordinate-like fields for `CNPC_Boss_Tier2`;
  the compact objective/structure filters omitted them. These are still not a
  validated transform, lane assignment, region projection, objective proximity,
  or mechanic effect.
- Replay 009 fixed coordinate-resolution outputs live in
  `output/replay-009-fixed-coordinate-resolution/`. Task 076 resolves
  vector-only replay coordinates for two late Walker generations and preserves
  raw team values for all six Walkers. Named teams, Walker lane identity,
  fit-eligible correspondences, transform fitting, regions, proximity,
  canonical spatial fields, and mechanic effects remain blocked.
- Replay 009 Walker identity outputs live in
  `output/replay-009-walker-identity/`. Task 077 confirms that the current
  permitted evidence still cannot map individual `CNPC_Boss_Tier2` handles to
  named Sapphire/Amber lane Walker symbols before residual inspection. Raw team
  values and two coordinate-ready Walkers are preserved, but no transform retry
  is eligible.
