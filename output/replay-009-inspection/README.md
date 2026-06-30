# Replay 009 Factual State Inspector

Generate with:

```bash
node tools/generate-replay-inspection-report.mjs --replay replay_009
```

Serve locally with:

```bash
node tools/serve-replay-inspector.mjs --dir output/replay-009-inspection
```

Open `index.html` through the local server. The inspector displays factual and candidate observations only. It does not perform strategic or macro analysis, apply mechanic effects, infer destruction/kills/objective completion, or use spatial regions.
