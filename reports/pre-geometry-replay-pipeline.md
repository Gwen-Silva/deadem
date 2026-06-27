# Pre-geometry replay pipeline

## Summary

Task 020 parameterized and executed the safe pre-geometry pipeline for replays 002, 003, and 004.

Gate result:

```text
pre_geometry_pipeline_ready_for_geometry_profile_tasks
```

Replay 002 was processed first as the smoke test. Because it passed, the same pipeline ran on replay 003 and replay 004.

## Results

| Replay | Result | Players | Heroes | Snapshots | Duration seconds | Issues |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `replay_002` | pass | 12 | 12 | 5 | 1834.73 | none |
| `replay_003` | pass | 12 | 12 | 5 | 2279.88 | none |
| `replay_004` | pass | 12 | 12 | 5 | 2012.11 | none |

## Executed stages

- replay loading
- player field discovery
- snapshot normalization
- controller/pawn lifecycle
- clock discovery
- tick reconciliation
- data-quality audit
- canonical timeline evidence
- hero identity evidence
- direct build identification placeholder
- raw movement coordinates

## Blocked stages

- lane mapping
- topology
- spatial regions
- movement region interpretation
- occupancy
- transitions

The script extracted raw coordinate snapshots only. It did not interpret regions or use geometry profiles.

## Replay 005 protection

Replay 005 was not processed by task 020.

It remains reserved as final holdout and was not used for threshold selection, rule design, geometry calibration, architecture selection, debugging, model selection, occupancy, episodes, or transitions.

## Outputs

- `output/replays/replay_002/pre-geometry-pipeline.json`
- `output/replays/replay_003/pre-geometry-pipeline.json`
- `output/replays/replay_004/pre-geometry-pipeline.json`
- `output/replays/pre-geometry-pipeline-summary.json`

## Next work

Geometry-profile tasks remain required before lane mapping, topology, spatial regions, movement region interpretation, or occupancy can run.

## Validation

Commands run:

```bash
node scripts\pre-geometry-replay-pipeline.js
node node_modules\eslint\bin\eslint.js -c eslint.common.config.js scripts\pre-geometry-replay-pipeline.js
node -e "const fs=require('fs'); const files=['output/replays/replay_002/pre-geometry-pipeline.json','output/replays/replay_003/pre-geometry-pipeline.json','output/replays/replay_004/pre-geometry-pipeline.json','output/replays/pre-geometry-pipeline-summary.json']; for(const f of files){JSON.parse(fs.readFileSync(f,'utf8')); const s=fs.statSync(f).size; if(s>10*1024*1024) throw new Error(f+' too large'); console.log(f,s)}"
npm.cmd run validate:tasks
```

Git verification found no staged or modified `.dem` files, no global replay 001 output modifications, and no replay 005 pipeline output.
