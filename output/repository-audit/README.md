# Repository Audit Snapshot

This directory preserves a repository hygiene audit snapshot from June 2026.

`cleanup-proposal.json` is not an executable current plan.
`canonical-file-map.json` is not the current source of project truth. Some
recommendations may be stale.

Package-local duplicate files must not be removed based only on equal hashes.
Broad archival, deletion, compression, history rewriting, and package cleanup
are deferred until after Task 096 measures pilot storage and cache behavior.

Use `data/current-artifact-registry.json` as the current compact navigation
registry.
