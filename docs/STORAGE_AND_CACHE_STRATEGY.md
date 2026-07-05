# Storage And Cache Strategy

This strategy governs scaling Deadem beyond the five-human-replay factual pilot.
It is a policy and planning layer only: no replay was processed, no existing
output was moved or deleted, and no historical artifact was migrated.

## Decision

Use compact committed artifacts by default and keep full replay-scale material
in ignored local cache unless a task explicitly authorizes a bounded exception.

Commit by default:

- source code, tests, schemas, and compact documentation;
- compact package manifests, hashes, counts, and source manifests;
- small validation summaries, gates, and bounded audit reports.

Local-only by default:

- raw replay files, videos, frames, VPKs, extracted maps, dense parser traces,
  command logs, profiling output, temporary reruns, and large generated full
  packages at scale.

Forbidden by default:

- committing raw replay files;
- reading or hashing replay 005 before final-holdout release;
- processing bot fixtures 006-008 outside explicitly authorized parser work.

## Artifact Classes

The machine-readable policy is `data/artifact-storage-policy.json`. Each class
declares Git policy, cache policy, provenance requirements, and whether large
outputs are allowed by default.

Core classes include raw replay, protected replay, unsupported bot replay,
parser output, source extraction artifact, canonical factual package, compact
package manifest, validation/audit artifact, report, benchmark/profiling
artifact, local cache, temporary rerun, logs, screenshots/videos/frames,
VPK/map extracted assets, model/runtime artifacts, and human annotations.

## Local Cache Roots

These roots are documented for future tasks; this task does not create or move
files into them:

- `.local/deadem/cache/`
- `.local/deadem/runs/`
- `.local/deadem/logs/`
- `.local/deadem/replays/`
- `.local/deadem/models/`

Future factual batch caches should use:

```text
.local/deadem/cache/factual-batches/<batch-id>/
```

## Cache Keys

Future cache keys must include replay ID, raw replay hash when allowed, source
artifact hashes, parser version or commit, canonical contract version, tool
version or commit, manifest hash, category set, extraction mode, build/version
metadata when available, and validation policy version.

Replay 005 is special: no cache key may require reading or hashing it before
final-holdout release. Use only pre-existing authorized metadata until release.

## Regeneration

If a task changes only reports or validation, it must not regenerate canonical
factual packages.

Canonical facts may be regenerated only when factual extraction or canonical
schema behavior changes and the task explicitly authorizes replay processing.
Validation artifacts and reports are regenerable from accepted facts and policy
version. Human annotations and external evidence metadata must be preserved and
must not be overwritten by automated regeneration.

## Large Outputs

The current output-size guard threshold is 10 MiB. A new or modified output
above that threshold requires explicit task authorization, a compact summary,
hash/provenance, and a reason it must be committed.

The known preexisting warning remains:

```text
output/04-controller-pawn-lifecycle.json
```

This task did not modify that file.

## Human Annotations

Future annotations must preserve replay ID, artifact hash, event ID, timestamp
or tick, schema version, author/source, and uncertainty. Regeneration must not
overwrite them.

## Runtime Independence

GPT, Codex, and local LLMs are development or explanation tools only. The
factual runtime must be able to process, cache, validate, and summarize data
without a hosted LLM dependency.
