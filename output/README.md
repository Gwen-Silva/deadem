# Output Directory

`output/` contains compact structured outputs and evidence packets. It is intentionally noisy because many files preserve auditability.

## Conventions

- Canonical evidence: current decision or input artifacts listed in `output/repository-audit/canonical-file-map.json`.
- Diagnostic outputs: parser, video, model, geometry, and replay-analysis evidence used to explain a decision.
- Intermediate outputs: generated files that can often be regenerated, but may still be tracked to preserve exact provenance.
- Regenerable outputs: files with known producer scripts; do not delete until a cleanup phase is approved.
- Local-only outputs: frames, contact sheets, dense media extracts, caches, and large debug logs belong in `output-local/` or ignored directories.

## Generated-File Policy

- Track compact JSON/JSONL/CSV manifests when they are evidence or task outputs.
- Keep frames, MP4 files, DEM files, model weights, and contact sheets out of Git.
- Do not assume JSON/CSV pairs are duplicates; one may serve machine use and the other human review.
- Full logs and debug traces should be local unless a bounded task explicitly requires a compact trace.

## Current Audit

- Tracked output files: 612
- Regenerable output files: 0
- Unknown files requiring investigation: 59
- Cleanup proposal: `output/repository-audit/cleanup-proposal.json`

## Archive

`output/archive/` contains approved historical material moved for navigation. Do not treat archived evidence as deleted or invalidated; indexes should point to canonical files and archive locations.

## Parser Compatibility Structural Pass

`output/parser-compatibility/structural-pass-*.json` files summarize replay container and message-envelope traversal. They are compact diagnostics, not gameplay telemetry.

## Replay 006 State Divergence Diagnostics
## Replay 006 Entity Lifecycle Diagnostics

## Replay 006 External Parser Oracle Diagnostics

`output/parser-compatibility/external-oracle-*.json`, `output/parser-compatibility/upstream-*.json`, and `output/parser-compatibility/external-oracle-execution-matrix.csv` summarize Task 052. These files compare the current parser against local-only external parser clones without committing third-party repositories or replay files. They are oracle/comparison evidence only; they do not authorize missing-entity skips, placeholder entities, or semantic telemetry from replay 006.

## Build 23916427 Parser Corpus Diagnostics

`output/parser-compatibility/new-replay-*.json`, `output/parser-compatibility/build-23916427-execution-matrix.*`, `output/parser-compatibility/bot-vs-normal-comparison.json`, and `output/parser-compatibility/new-corpus-*.json` summarize Task 054. These files compare user-supplied replays 007-009 against existing parser failure evidence. They are compact compatibility diagnostics only; full traces remain local/untracked and replay 005 remains excluded.

## Generic Bot/Solo Lifecycle Diagnostics

`output/parser-compatibility/bot-solo-*.json`, `output/parser-compatibility/replay-007-failing-packet-operations.jsonl`, and `output/parser-compatibility/replay-008-failing-packet-operations.jsonl` summarize Task 055. They distinguish replay 007's out-of-range packet-entity lookup value from replay 008's bounded missing LEAVE. These outputs are diagnostics only and do not authorize bot-mode skips, placeholder entities, or parser recovery.

## Replay 009 Telemetry Validation

`output/replay-009-validation/` contains Task 056 compact quality outputs for the build-23916427 normal human replay. The directory records source inventory, match envelope, roster, controller/pawn lifecycle, position quality, economy quality, death-counter events, pause/disconnect audits, cross-source consistency, downstream readiness, and the validation gate. It does not contain raw replay traces, video frames, or replay files.

## Replay 009 Spatial Geometric Validation

`output/replay-009-spatial/` contains Task 061 compact spatial dependency
outputs. Player coordinates are usable with constraints, but map transform,
generic regions, lane projection, objective/structure geometry, and proximity
capability remain unavailable for replay 009. These outputs do not approve lane
occupancy, objective effects, rotations, pressure, or macro interpretation.

Task 057 adds pause/clock observability outputs in the same directory. The gate is `replay_009_pause_clock_not_exposed`: no reliable direct pause signal or authoritative game-clock source was found, so parser seconds remain the canonical available time basis.

## Replay 009 Factual State Detection

`output/replay-009-states/` contains Task 060 compact observed-state outputs in
partial non-spatial mode. It includes player identity, life/death/respawn
parser-time events, death consistency, net-worth endpoint summaries, and
knowledge-layer ambiguity results. Spatially dependent files contain explicit
unavailable metadata only. Mechanic activation, mechanic effects, objective
proximity, lane/region membership, and macro interpretation remain blocked.

Task 062 adds `objective-structure-*.json` and `.jsonl` observability outputs.
They inventory replay-009 classes, serializers, candidate properties, lifecycle
operations, and message-name candidates for objective/structure mechanics. Mid
Boss and core structures are observable with constraints; Spirit Urn and
Rejuvenator remain partial/uncertain. These outputs are not mechanic activation
or spatial state events.

Task 063 adds `objective-structure-factual-events.jsonl` plus mechanic-specific
event shards for Mid Boss, Guardian, Walker, Patron/base structures, Urn
candidates, and Rejuvenator candidates. These files convert only Task 062 direct
class/property/lifecycle evidence. Health zero is not a kill/destruction
conclusion, entity deletion is not objective completion, and mechanic effects
remain unapplied.

Task 064 adds video-backed independent validation outputs under
`output/replay-009-validation/`. The accepted source is a replay-009 video with
an independent visual rendering path but the same match-data origin. Mid Boss
events receive the strongest visual support, Walker events are supported with
constraints, Patron/base identity remains ambiguous, Guardian sample coverage is
not visible, and Spirit Urn/Rejuvenator remain unresolved. No mechanic effects,
objective completion, kill, destruction, claim, deposit, secure, or macro
conclusions are applied.

## Replay 009 Canonical Factual State

`output/replay-009-canonical/` contains Task 065 canonical replay-state outputs:
schemas, source integration matrix, player/entity registries, factual timeline,
non-timeline metadata, validation overlays, snapshots, capability matrix, and
gate. Canonical means normalized and provenance-preserving; it does not mean all
events are independently validated. Task 064 visual support is attached only to
matched event-level overlays. Spatial fields remain unavailable, visual
synchronization has bounded uncertainty, camera absence is not entity absence,
entity deletion is not destruction/completion, and mechanic effects remain
unapplied.

## Replay 009 Factual State Inspector

`output/replay-009-inspection/` contains the Task 066 static inspector generated
from canonical replay-009 outputs. It includes self-contained HTML, CSS,
JavaScript, and compact data JSON for overview, capabilities, timeline events,
non-timeline metadata, players, entities, snapshots, and validation overlays.
The inspector is a local review surface only. It preserves provenance and
semantic limits, keeps parser time unadjusted, and applies zero mechanic
effects.

## Replay 009 Inspector Workflow Evaluation

`output/replay-009-inspection-evaluation/` contains the Task 067 workflow
evaluation for the static inspector. It records 12 scripted review workflows,
CLI/interface/export parity checks, usability scorecard rows,
misinterpretation-risk audit rows, issues, and the evaluation gate. The
evaluation is automated plus single-reviewer technical inspection; it is not
broad user research and it does not add gameplay facts or mechanic effects.

## Project Milestone Analysis

`output/project-milestone-analysis/` contains the Task 068 planning outputs:
dependency graph, capability-blocker matrix, gap recoverability, replay-005
release criteria, milestone comparison, recommended task sequence, milestone
decision, and gate. The selected primary milestone is spatial foundation first,
with open dependencies on map geometry and coordinate anchors. These outputs are
planning artifacts only and do not implement spatial projection or macro
analysis.

## Replay 009 Spatial Input Acquisition

`output/replay-009-spatial-inputs/` contains the Task 069 acquisition package
for the spatial-foundation milestone. It records local installed map-package
metadata, external/reference source metadata, map-change chronology entries,
geometry candidates, replay-derived candidate anchors, calibration feasibility,
and provenance/licensing constraints. The gate is
`replay_009_map_geometry_inputs_ready_with_limitations`: transform
experimentation can be scoped, but build compatibility, accepted independent map
coordinates, regions, lanes, objective proximity, and macro interpretation are
not available.

## Replay 009 Candidate Transform Validation

`output/replay-009-transform-validation/` contains the Task 070 transform
prerequisite audit. It verifies local-only access to the preferred installed
map package, inventories bounded spatial resources through VPK/package-index
metadata, preregisters candidate model families, and records why fitting is not
allowed. The gate is `replay_009_candidate_transform_not_ready`: no independent
coordinate-bearing map landmarks, fit anchors, held-out validation anchors,
fitted transform, region, lane, proximity, or mechanic-effect output exists.

## Replay 009 Human Annotations And Independent Landmarks

`output/replay-009-human-annotations/` contains the Task 071 participant
annotation packet. It is advisory human evidence: it can guide search and
constrain identity hypotheses, but it does not overwrite canonical facts,
convert human game times into parser seconds, apply mechanics, or validate exact
coordinates.

`output/replay-009-independent-landmarks/` contains the Task 071 coordinate
acquisition result. The five referenced map/minimap images were not found
locally, so no pixel landmarks, accepted map coordinates, reserved validation
anchor, transform, lane, region, proximity, or mechanic-effect output exists.

`output/replay-009-landmark-measurement/` contains the Task 072 follow-up after
the user supplied the local map/minimap images. It records local-only image
hashes and dimensions, role classification, advisory orientation annotations,
bounded pixel coordinates for Mid Boss, Walkers, Guardians, and base-symbol
landmarks, qualitative cross-image registration, correspondence candidates, and
a preregistered future fit/validation split. It still emits no transform,
region, lane, objective proximity, or mechanic effect.

`output/replay-009-transform-retry/` contains the Task 073 retry using those
measured landmarks. The gate is `replay_009_candidate_transform_not_ready`:
map-image coordinates exist, but compact replay-009 fixed objective/structure
records still do not expose replay-world coordinates, and Walker entity-to-map
landmark identities remain unresolved before residual inspection. No transform,
held-out residual, topology check, lane, region, proximity, production spatial
field, or mechanic effect was emitted.

`output/replay-009-fixed-entity-resolution/` contains the Task 074 audit for
`CNPC_MidBoss` and `CNPC_Boss_Tier2`. The gate is
`replay_009_walker_identity_coordinates_not_ready`: existing compact outputs
show target class/lifecycle/health evidence and component/reference-style
properties, but no usable direct or component-resolved world coordinates, no
Walker team/lane identities, and no fit-eligible or validation-eligible
correspondences. No transform, lane, region, proximity, production spatial
field, or mechanic effect was emitted.
