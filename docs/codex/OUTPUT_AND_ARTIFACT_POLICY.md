# Output And Artifact Policy

Local by default:

- logs;
- temporary files;
- reruns and A/B copies;
- intermediate reports;
- videos, frames, clips;
- full dumps;
- profiling outputs;
- context and review packets.

Commit only compact, authorized artifacts: code, tests, documentation, schemas, small synthetic fixtures, manifests, hashes, summaries, and final bounded reports.

Files larger than 100 KiB that are new or modified by the current task must be listed in `largeOutputsAllowed` with a justification. Historical files already above the limit should not be changed merely because they are large.

Do not delete existing outputs. A task that does not change extraction must not regenerate factual events, snapshots, registries, or other large factual artifacts.

Task specs declare:

```json
{
  "regenerationPolicy": {
    "canonicalFacts": "reuse",
    "validationArtifacts": "regenerate",
    "reports": "regenerate"
  }
}
```

Allowed values are `reuse`, `regenerate`, and `forbidden`.
