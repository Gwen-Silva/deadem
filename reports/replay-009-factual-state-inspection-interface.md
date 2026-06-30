# Replay 009 Factual State Inspection Interface

Task 066 generated a static local inspector for the Task 065 canonical replay-009 factual state layer.

## Gate

`replay_009_factual_state_inspector_ready_with_constraints`

## Output

- Static interface: `output/replay-009-inspection/index.html`
- Local server: `node tools/serve-replay-inspector.mjs --dir output/replay-009-inspection`
- Export tool: `tools/export-replay-factual-report.mjs`

## Loaded Data

- Canonical records: 787
- Timeline records: 423
- Non-timeline metadata records: 364
- Players: 12
- Entities: 80
- Snapshots: 187
- Validation overlays: 37
- Unmatched overlays: 0

## Boundaries

The inspector displays factual and candidate observations. It does not apply mechanic effects, infer spatial regions, classify lanes, infer objective completion, destruction, kills, secured objectives, fights, pressure, macro decisions, or strategy.
