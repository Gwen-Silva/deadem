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
