# Replay 009 Map Geometry Input Acquisition

Task: `069-acquire-replay-009-map-geometry-and-calibration-inputs`

Gate: `replay_009_map_geometry_inputs_ready_with_limitations`

## Summary

Task 069 acquired compact metadata for replay-009 spatial-foundation inputs. It found local map/package candidates and replay landmark candidates, but it did not validate a map transform, emit regions or lanes, compute proximity, or apply mechanic effects.

The best current geometry candidate is the local installed `dl_midtown.vpk` package recorded as metadata only. It is not committed, not redistributed, and not proven compatible with replay build `23916427`.

## Sources Found

- 10 local sources, including the Steam Deadlock app manifest, local installed map VPK metadata, local GameTracking metadata/index files, and one older match-specific map reference.
- 4 external/reference sources, including local GameTracking/deadlock-metadata checkouts, Deadlock Wiki as a future secondary reference, and a secondary public chronology reference for a map/objective experiment.

The installed Deadlock app manifest reports Steam build `23989856` and target build `23990779`, which are not directly mapped to replay build `23916427`. This is recorded as `newer_build_only`, not an exact match.

## Geometry Candidates

- `geom_installed_dl_midtown_vpk`: preferred candidate, local-only Valve package metadata.
- `geom_gametracking_minimap_material_index`: alternate candidate, material/index evidence only.
- `geom_match_91119257_map_reference`: reference-only artifact from another match context.

No candidate is authoritative for replay 009 yet.

## Calibration Anchors

Task 069 identified 56 replay-derived candidate landmark records from the canonical entity registry. Eight are supported candidate anchors for future work: two Mid Boss generations and six Walkers. No anchor is currently usable for calibration because no independent map pixel/geometry coordinate was acquired for the same landmark.

Four prohibited shortcut methods are explicitly rejected as anchors: spawn-cluster-only inference, lane centers from path density, entity deletion locations, and symmetry-only orientation.

## Feasibility

No transform was fitted. The simplest feasible transform class is `none_yet`.

The next step can be a bounded transform-validation task only if it first obtains or derives local map coordinates for accepted anchors and reserves at least one independent validation anchor. Build compatibility and licensing constraints must remain explicit.

## Validation

Task 069 validation covered:

- source inventory schema;
- path normalization;
- provenance and licensing completeness;
- chronology consistency;
- geometry candidate boundaries;
- anchor evidence and shortcut rejection;
- calibration feasibility;
- no-transform/no-region/no-lane guarantees;
- JSON validation;
- deterministic regeneration;
- task queue validation;
- documentation link validation.

## Remaining Uncertainty

- Build `23916427` is still not mapped to a Steam build, manifest, patch, or map package.
- No license-clear committed map image or geometry artifact was acquired.
- No independent map-coordinate anchors were acquired.
- No world-to-map transform, region projection, lane projection, or objective proximity is available.

Replay 005 and bot fixtures 006-008 were not read or processed.
