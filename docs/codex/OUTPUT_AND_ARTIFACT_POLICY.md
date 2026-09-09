# Output And Artifact Policy

## Forward storage contract

- `artifacts/`: compact authorized evidence, gates, summaries, hashes and
  manifests for new tasks. It is the preferred versioned evidence root.
- `.local/`: dense payloads, media, private transcripts/annotations, extracted
  audio, frames, models, caches, reruns, profiles, logs, context/review packets
  and detailed inventories. Local does not mean disposable.
- `output/`: historical compatibility root. Its ignore rule does not untrack
  existing files. Preserve active runtime envelopes and retained historical
  evidence; do not use this root for new compact evidence by default.
- `reports/`, `tasks/`, `docs/`, `schemas/`, source and tests keep their existing
  bounded roles. Do not redistribute game assets or private media.

## Changed-artifact size guard

`npm run check:outputs` compares the task's accepted base with the current Git
changes, including staged, unstaged and non-ignored new files. It does not walk
old output trees. Every new or modified destination, at any depth and with any
extension, is limited to **100 KiB (102400 bytes)**. Rename destinations are
checked. Deleted paths are classified without stat/open. Protected input targets
and aliases are rejected before filesystem or blob access; links are not followed.
Classification uses namespace and repository role, not a token found inside a
document. Historical task/report/source metadata mentioning 005-008 remains
readable; actual replay/input/media/evidence targets remain forbidden.

An exception must be explicitly authorized in the active task spec:

```json
{
  "largeOutputsAllowed": [
    { "path": "artifacts/example/authorized.json", "reason": "Specific approved need" }
  ]
}
```

Only exact repository paths with a nonempty reason are accepted. Wildcards,
blanket extensions, directory exemptions and unreasoned strings are rejected.
The old 10 MiB storage-policy threshold and top-level experiment JSON scan are
retired. Historical specs keep their audit identity; their old exception format
does not authorize a new execution. Old oversized files are not regenerated or
modified merely to satisfy the changed-file guard.

## Preservation, retention and retirement

Never remove or move outputs without explicit task authority. Retirement from
the current tree is different from history deletion: authorized historical
groups need a base SHA, tree/blob identity, selector, retained members, reason,
consumer closure and a recovery contract. Keep uncertain groups. Do not rewrite
Git history. Task222's bounded retirement is documented in
`HISTORICAL_ARTIFACT_RECOVERY.md`; active runtime payloads were not retired.

Regenerable caches may be proposed for cleanup only after per-target checks for
current consumers, reproducible source, ignored status, unchanged metadata and
safe path boundaries. No blanket `.local/`, environment, dependency or age-only
deletion is allowed. Human annotations, active evidence, logs needed for an open
gate and diagnostic screenshots require explicit retention decisions. Protected
005-008 input targets and aliases are excluded before stat/open/hash/read/delete.

A task that does not change extraction must not regenerate factual events,
snapshots, registries or dense factual artifacts. Specs declare
`regenerationPolicy` for `canonicalFacts`, `validationArtifacts` and `reports`;
allowed values are `reuse`, `regenerate` and `forbidden`.
