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
