# Replay intake and compatibility

## Summary

Task 016 created the five-replay intake infrastructure and inspected local `.dem` files under `samples/`.

Gate result:

```text
replays_require_build_specific_work
```

All five files were readable by the parser, but direct build/content-version and map metadata were not exposed through the lightweight `Player` intake path. Geometry compatibility therefore remains unverified, and build 6592 lane topology must not be reused automatically.

## Replay inventory

| Replay | File | Role | Size bytes | SHA-256 | Compatibility |
| --- | --- | --- | ---: | --- | --- |
| `replay_001` | `partida_001.dem` | development | 675628880 | `e80ac19fb225d1f02cd02364ed42625d8751b7d4d4a4481a48a96a0c7bdd1983` | `insufficient_metadata` |
| `replay_002` | `partida_002.dem` | generalization | 396772195 | `8175e5cdd4b590fb92ba2b7e6ae3709af28ff645fcbeaa2fadd9a8d40d22912c` | `insufficient_metadata` |
| `replay_003` | `partida_003.dem` | generalization | 501017569 | `629a57cec6944cc8f898bd9d72d72fc3f402eaae8ba996825be18761a2590b96` | `insufficient_metadata` |
| `replay_004` | `partida_004.dem` | generalization and stability | 456466546 | `6c59088fcb9adb043bc230e90d242d259577c53b8c40800d8f86ba2e9be5b7c4` | `insufficient_metadata` |
| `replay_005` | `partida_005.dem` | final holdout | 530808576 | `0a338c82f73eb7bb4b15e794d3f6a7da17893f95ab6a82c2742358450e93811c` | `insufficient_metadata` |

All paths in `data/replay-manifest.json` are relative local paths. Replay files remain ignored and were not staged.

## Parser results

Parser load status:

- `replay_001`: pass
- `replay_002`: pass
- `replay_003`: pass
- `replay_004`: pass
- `replay_005`: pass

Parser failures: none.

All five replays exposed valid tick domains, 12 real player controllers, 12 hero IDs, and critical player classes.

## Build and map comparison

Detected build/content version:

- all replays: `null`

Detected map:

- all replays: `null`

This is not evidence that the builds/maps match. It means the lightweight intake path did not expose those fields. The next task must use build/map metadata APIs or reproducible fingerprints before any common geometry reuse.

## Compatibility matrix

All replays currently have:

- parser compatibility: `pass`
- tick-domain compatibility: `pass`
- canonical timeline compatibility: `likely_parameterizable`
- player identity compatibility: `pass`
- hero identity compatibility: `pass`
- map compatibility: `unknown`
- geometry compatibility: `unverified`
- occupancy-model compatibility: `blocked_until_geometry_confirmed`
- build metadata compatibility: `unknown`

Primary compatibility status for every replay is `insufficient_metadata`.

## Geometry risks

The existing topology is build/content-version 6592 evidence from replay 001 work. It must not be reused automatically for replays 002-005.

Each replay needs a build/map/fingerprint grouping and a geometry profile decision before lane mapping, topology, spatial regions, movement, or occupancy can be considered compatible.

## Reusable pipeline stages

The processing plan allows these stages to be parameterized first, subject to script refactor:

- replay loading
- player field discovery
- snapshot normalization
- controller-pawn lifecycle
- clock discovery
- tick reconciliation
- player timeline
- data quality
- canonical timeline
- hero identity
- build identification

Lane mapping, topology, spatial regions, movement, and occupancy are blocked until geometry compatibility is confirmed. Occupancy remains optional and explicitly blocked.

## Script parameterization audit

Scripts ready without refactor: none.

Parameterizable:

- `experiments/11-reconcile-hero-identities.js`

Replay-specific:

- `experiments/01-validate-replay.js`
- `experiments/02-inspect-player-fields.js`
- `experiments/03-normalize-player-snapshots.js`
- `experiments/04-analyze-controller-pawn-lifecycle.js`
- `experiments/05-discover-game-clock.js`
- `experiments/06-reconcile-tick-domains.js`
- `experiments/07-player-timeline.js`
- `experiments/09-build-canonical-player-timeline.js`
- `experiments/10-map-hero-identities.js`
- `experiments/12-identify-replay-build.js`

Build-specific:

- `experiments/08-analyze-data-quality.js`
- `experiments/13-enrich-heroes-and-map-lanes.js`
- `experiments/14-discover-items-and-upgrades.js`
- `experiments/15-decode-upgrade-tokens.js`
- `experiments/16-reconcile-lane-topology.js`
- `experiments/17-build-spatial-presence-model.js`
- `experiments/18-build-movement-segments.js`

## Output isolation plan

Future replay outputs are reserved under:

- `output/replays/replay_001/`
- `output/replays/replay_002/`
- `output/replays/replay_003/`
- `output/replays/replay_004/`
- `output/replays/replay_005/`

Only `.gitkeep` placeholders were created. Existing replay 001 outputs were not moved or rewritten.

The migration plan is recorded in `output/replay-processing-plan.json`.

## Final-holdout protection

`replay_005` was accessed only for file hash, file size, basic parser metadata, and compatibility dimensions.

It remains prohibited for threshold selection, rule design, geometry calibration, architecture selection, debugging based on expected outputs, or best-model selection until a candidate pipeline and hypothesis are frozen.

## Next executable task

Task 019 was created:

```text
tasks/pending/019-abstract-replay-build-map-compatibility.md
```

It is limited to build/map/fingerprint and geometry-profile compatibility. It must not run occupancy, transition detection, model recalibration, or downstream event work.

## Validation

Commands run:

```bash
node scripts\replay-intake.js
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js scripts\replay-intake.js
node -e "for (const f of ['data/replay-manifest.json','output/replay-intake-summary.json','output/replay-compatibility-matrix.json','output/replay-processing-plan.json','output/replay-script-parameterization-audit.json']) JSON.parse(require('node:fs').readFileSync(f,'utf8')); console.log('json parse ok');"
node -e "const fs=require('fs'); const files=['data/replay-manifest.json','output/replay-intake-summary.json','output/replay-compatibility-matrix.json','output/replay-processing-plan.json','output/replay-script-parameterization-audit.json']; for (const f of files) { const s=fs.statSync(f).size; if (s>10*1024*1024) throw new Error(f+' too large '+s); console.log(f, s); }"
npm.cmd run validate:tasks
```

The repository `check:outputs` helper was attempted, but it accepts only numeric experiment IDs. Replay-intake output sizes were therefore validated with the explicit Node size check above.

Metadata extraction was rerun and SHA-256 hashes of the five generated JSON outputs were unchanged.
